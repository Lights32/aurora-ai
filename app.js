document.addEventListener("DOMContentLoaded", () => {
  /* ====================================================
   * Module: Dependency Checker
   * ==================================================== */
  (function DependencyChecker() {
    if (typeof marked === "undefined") {
      console.error(
        "Error: The marked library is not loaded. Please include it in your project."
      );
    }
    if (typeof hljs === "undefined") {
      console.error(
        "Error: The hljs library is not loaded. Please include it in your project."
      );
    }
    if (typeof DOMPurify === "undefined") {
      console.error(
        "Error: The DOMPurify library is not loaded. Please include it in your project."
      );
    }
  })();

  /* ====================================================
   * Module: Config & State Initialization
   * ==================================================== */
  const storedApiKey = localStorage.getItem("apiKey");
  const CONFIG = window.CONFIG || {};
  CONFIG.API_KEY =
    storedApiKey && storedApiKey !== "null"
      ? storedApiKey
      : CONFIG.API_KEY || "YOUR_API_KEY_HERE";

  if (CONFIG.API_KEY === "YOUR_API_KEY_HERE") {
    console.warn(
      "Warning: Using placeholder API key. Please set a valid API key via the settings modal."
    );
  }
  const DEFAULT_SYSTEM_PROMPT = "You are Aurora, a helpful AI assistant.";

  const CONSTANTS = {
    detailPresets: {
      concise: {
        instruction:
          "Present a succinct response that emphasizes the core points with clarity and brevity, avoiding extraneous details.",
        tokens: 2048,
      },
      balanced: {
        instruction:
          "Craft a well-rounded response that covers essential details and context in clear, direct language without overcomplicating the message.",
        tokens: 4096,
      },
      detailed: {
        instruction:
          "Deliver a comprehensive response that thoroughly explains the topic with extensive information, illustrative examples, and nuanced insights to fully address the query.",
        tokens: 8192,
      },
      context: {
        instruction:
          "Provide an in-depth response enriched with extensive background information, clarifications, illustrative examples, and supported by relevant sources for validation.",
        tokens: 8000,
      },
    },
    apiEndpoint: "https://api.deepseek.com/v1/chat/completions",
    animationSettings: {
      buttonPress: [
        { transform: "scale(1)" },
        { transform: "scale(0.96)" },
        { transform: "scale(1)" },
      ],
      duration: 300,
    },
  };

  // Load saved app state (if any)
  function loadAppState() {
    try {
      const stored = localStorage.getItem("appState");
      return stored ? JSON.parse(stored) : null;
    } catch (err) {
      console.warn("Failed to parse saved state:", err);
      return null;
    }
  }
  const savedState = loadAppState();

  // Initialize state
  const state = {
    currentMode: savedState?.currentMode || "analyst",
    temperature: savedState?.temperature || 0.0,
    pendingMessages: new Map(),
    chatHistory: savedState?.chatHistory || [],
    currentDetail: savedState?.currentDetail || "balanced",
    currentModel: savedState?.currentModel || "deepseek-chat",
    isLoading: false,
    attachments: [],
    lastMessageTime: 0,
    userProfile: {}, // will be set in loadUserProfile
    uiElements: {
      modeButtons: document.querySelectorAll(".mode-pill"),
      chatContainer: document.getElementById("chatContainer"),
      chatPlaceholder: document.getElementById("chatPlaceholder"),
      userInput: document.getElementById("userInput"),
      sendBtn: document.getElementById("sendBtn"),
      modal: document.getElementById("confirmationModal"),
      modalConfirm: document.getElementById("modalConfirm"),
      modalCancel: document.getElementById("modalCancel"),
      fileUploadBtn: document.getElementById("fileUploadBtn"),
      fileInput: document.getElementById("fileInput"),
      detailPills: document.querySelectorAll(".detail-pill"),
      modelPills: document.querySelectorAll(".model-pill"),
      settingsModal: document.getElementById("settingsModal"),
      settingsForm: document.getElementById("settingsForm"),
      settingsCancel: document.getElementById("settingsCancel"),
      apiKeyInput: document.getElementById("apiKeyInput"),
      clearCacheBtn: document.getElementById("clearCacheBtn"),
      userSettingsBtn: document.getElementById("userSettingsBtn"),
    },
    constants: CONSTANTS,
  };

  // Check critical DOM elements
  if (!state.uiElements.chatContainer) {
    console.error("Error: 'chatContainer' element not found in DOM.");
    return;
  }
  if (!state.uiElements.userInput) {
    console.error("Error: 'userInput' element not found in DOM.");
    return;
  }
  if (!state.uiElements.sendBtn) {
    console.error("Error: 'sendBtn' element not found in DOM.");
    return;
  }
  if (!state.uiElements.chatPlaceholder) {
    console.warn(
      "Warning: 'chatPlaceholder' element not found in DOM. Some UI elements may not display correctly."
    );
  }

  /* ====================================================
   * Module: Profile & Theme Management
   * ==================================================== */
  function loadUserProfile() {
    try {
      const storedProfile = localStorage.getItem("userProfile");
      if (storedProfile) {
        state.userProfile = JSON.parse(storedProfile);
        if (!state.userProfile.language) {
          state.userProfile.language = "english";
        }
      } else {
        state.userProfile = { language: "english" };
      }
    } catch (err) {
      console.warn("Failed to parse user profile:", err);
      state.userProfile = { language: "english" };
    }
  }

  function loadThemePreference() {
    const savedTheme = localStorage.getItem("themePreference");
    const htmlElement = document.documentElement;
    if (savedTheme === "dark") {
      htmlElement.setAttribute("data-theme", "dark");
    } else {
      htmlElement.setAttribute("data-theme", "light");
    }
  }

  loadUserProfile();
  loadThemePreference();

  // Initialize chatHistory if not loaded already
  if (!state.chatHistory.length) {
    const userName = state.userProfile?.name || "";
    const userLang = state.userProfile?.language || "english";
    state.chatHistory.push({
      role: "system",
      content:
        getSystemPrompt(state.currentMode, userName, userLang) +
        "\n" +
        CONSTANTS.detailPresets.balanced.instruction,
    });
  }

  /* ====================================================
   * Module: Helper Functions
   * ==================================================== */
  function getSystemPrompt(mode, userName = "", language = "english") {
    try {
      const namePart = userName ? `The user's name is ${userName}. ` : "";
      const languageMap = {
        english:
          "The user's primary language is English. From now on, reply in English.",
        german:
          "The user's primary language is German. From now on, reply in German.",
      };
      const languageInstruction = languageMap[language] || languageMap.english;
      const prompts = {
        coding:
          "You are Aurora, an AI assistant specialized in advising and teaching the creation, modification, improvement, and management of code files and projects. Always analyze provided code and monitor all changes chronologically. " +
          namePart +
          languageInstruction,
        creator:
          "You are Aurora, an AI assistant specialized in advising and teaching the creation of all art and media. Emphasize creativity while remaining informative. " +
          namePart +
          languageInstruction,
        analyst:
          "You are Aurora, an AI assistant specialized in advising and teaching about science, finance, and legal topics. Provide the user with maximum advantages by offering evidence, proof, and sources for key points. " +
          namePart +
          languageInstruction,
      };
      return prompts[mode] || prompts.analyst;
    } catch (error) {
      console.error("System prompt error:", error);
      return DEFAULT_SYSTEM_PROMPT;
    }
  }

  function saveAppState() {
    const dataToSave = {
      chatHistory: state.chatHistory,
      currentMode: state.currentMode,
      currentDetail: state.currentDetail,
      currentModel: state.currentModel,
      temperature: state.temperature,
      userProfile: state.userProfile,
    };
    localStorage.setItem("appState", JSON.stringify(dataToSave));
  }

  function debounce(func, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => func.apply(this, args), delay);
    };
  }

  function autoExpand(field) {
    const MIN_HEIGHT = 52;
    field.style.height = "auto";
    const computed = window.getComputedStyle(field);
    const maxH = parseFloat(computed.maxHeight) || 9999;
    const naturalH = Math.max(field.scrollHeight, MIN_HEIGHT);
    field.style.height = `${Math.min(naturalH, maxH)}px`;
    field.style.overflowY = naturalH >= maxH ? "auto" : "hidden";
  }

  function typeText(element, rawText, onComplete, charsPerTick = 1, delay = 4) {
    let index = 0;
    let tempBuffer = "";
    const length = rawText.length;
    function typeChunk() {
      if (index < length) {
        tempBuffer += rawText.slice(index, index + charsPerTick);
        const sanitized = DOMPurify.sanitize(tempBuffer);
        element.innerHTML = marked.parseInline(sanitized);
        const oldCursor = element.querySelector(".fake-cursor");
        if (oldCursor) oldCursor.remove();
        const cursor = document.createElement("span");
        cursor.className = "fake-cursor";
        cursor.textContent = "▋";
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false);
        range.insertNode(cursor);
        range.detach();
        index += charsPerTick;
        setTimeout(typeChunk, delay);
      } else {
        element.innerHTML = marked.parse(DOMPurify.sanitize(rawText));
        const finalCursor = element.querySelector(".fake-cursor");
        if (finalCursor) finalCursor.remove();
        if (typeof onComplete === "function") onComplete();
      }
    }
    typeChunk();
  }

  function getTimeAgo(date) {
    const intervals = {
      year: 525600,
      month: 43800,
      week: 10080,
      day: 1440,
      hour: 60,
      minute: 1,
    };
    const diff = Math.floor((Date.now() - date) / 60000);
    for (const [unit, unitVal] of Object.entries(intervals)) {
      const interval = Math.floor(diff / unitVal);
      if (interval >= 1) {
        return `${interval} ${unit}${interval > 1 ? "s" : ""} ago`;
      }
    }
    return "Just now";
  }

  function scrollToBottomIfNeeded(force = false) {
    const container = state.uiElements.chatContainer;
    if (!container) return;
    requestAnimationFrame(() => {
      if (force || isNearBottom(container)) {
        container.scrollTop = container.scrollHeight;
      }
    });
  }

  function isNearBottom(container, threshold = 100) {
    return (
      container.scrollHeight - container.scrollTop - container.clientHeight <=
      threshold
    );
  }

  function estimateTokenCount(text) {
    return Math.ceil(text.length / 4);
  }

  // --- File Attachment Preview ---
  function updateAttachmentPreviews() {
    const container = document.getElementById("attachmentPreviews");
    if (!container) return;
    container.innerHTML = "";
    state.attachments.forEach((attachment, idx) => {
      const preview = document.createElement("div");
      preview.className = "attachment-preview";
      preview.innerHTML = `
            <span>${attachment.name}</span>
            <button onclick="removeAttachment(${idx})">
              <i class="fas fa-times"></i>
            </button>
          `;
      container.appendChild(preview);
    });
  }

  // --- File Reading ---
  async function readFileContent(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (file.type.startsWith("image/")) {
          resolve(`![Uploaded Image](${e.target.result})`);
        } else {
          resolve(
            `**Uploaded File (${file.name}):**\n\`\`\`\n${e.target.result}\n\`\`\``
          );
        }
      };
      reader.onerror = reject;
      if (file.type.startsWith("image/")) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });
  }

  // Expose removeAttachment globally
  window.removeAttachment = function (index) {
    state.attachments.splice(index, 1);
    updateAttachmentPreviews();
  };

  /* ====================================================
   * Module: DOM Message Rendering & Chat History
   * ==================================================== */
  function addMessage(
    content,
    type,
    insertAfter = null,
    messageId = null,
    settings = null,
    skipTyping = false,
    processingTime = null
  ) {
    const frag = new DocumentFragment();
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${type}-message`;
    if (messageId && type === "user") {
      messageDiv.dataset.messageId = messageId;
    }
    if (type === "ai-cot") {
      messageDiv.innerHTML = `<span class="message-content"></span>`;
    } else {
      const modeLabel = settings?.mode || state.currentMode;
      const estimatedTokens = Math.ceil(content.length / 4);
      const processingTimeHTML =
        type === "ai" && processingTime
          ? `<span class="message-request-time" data-timestamp="${new Date().toISOString()}">
                  ${processingTime}&nbsp;s
                </span>`
          : "";
      const tokenEstimateHTML =
        type !== "error"
          ? `<span class="message-token-estimate"><span style="color:var(--color-text-secondary);">♦&nbsp;</span>${estimatedTokens}&nbsp;Tokens</span>`
          : "";
      messageDiv.innerHTML = `
            <div class="message-header">
              <span class="message-username">
                ${
                  type === "user"
                    ? state.userProfile?.name
                      ? `${state.userProfile.name} (You)`
                      : "You"
                    : `<div>${modeLabel} → Aurora&nbsp;⚙</div>Aurora`
                }
              </span>
              <div class="row">
                ${processingTimeHTML}
                ${tokenEstimateHTML}
                <span class="message-timestamp" data-timestamp="${new Date().toISOString()}">
                  ${getTimeAgo(new Date())}
                </span>
              </div>
            </div>
            <span class="message-content"></span>
          `;
      // For handling "/end" command
      document.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          const userInput = state.uiElements.userInput.value.trim();
          if (userInput === "/cancel") {
            cancelCurrentRequest();
            state.uiElements.userInput.value = "";
          }
        }
      });
      function cancelCurrentRequest() {
        if (state.isLoading) {
          state.isLoading = false;
          hideLoading();
          state.pendingMessages.clear();
          console.warn("Request canceled by user");
          addMessage("Request canceled by user", "error");
        }
      }
    }
    const contentElement = messageDiv.querySelector(".message-content");
    if (type === "user" || type === "error") {
      contentElement.innerHTML =
        type === "error"
          ? DOMPurify.sanitize(content)
          : marked.parse(DOMPurify.sanitize(content));
    } else if (type === "ai") {
      messageDiv.classList.add("typing");
      if (skipTyping) {
        contentElement.innerHTML = marked.parse(DOMPurify.sanitize(content));
        messageDiv.classList.remove("typing");
      } else {
        typeText(contentElement, content, () => {
          contentElement.innerHTML = marked.parse(DOMPurify.sanitize(content));
          messageDiv.classList.remove("typing");
        });
      }
    } else if (type === "ai-cot") {
      contentElement.innerHTML = marked.parse(DOMPurify.sanitize(content));
    }
    frag.appendChild(messageDiv);
    if (type === "ai" && messageId) {
      const pendingObj = state.pendingMessages.get(messageId);
      if (pendingObj) {
        const requestTimeSpan = messageDiv.querySelector(
          ".message-request-time"
        );
        if (requestTimeSpan && processingTime) {
          requestTimeSpan.textContent = `${processingTime} s`;
        }
        pendingObj.element.after(frag);
        state.pendingMessages.delete(messageId);
        return;
      }
    } else if (insertAfter) {
      insertAfter.after(frag);
    } else {
      state.uiElements.chatContainer.appendChild(frag);
    }
    scrollToBottomIfNeeded();
    updateRelativeTimestamps();
    updatePlaceholderVisibility();
  }

  function updateRelativeTimestamps() {
    document.querySelectorAll(".message-timestamp").forEach((el) => {
      const timestampString = el.dataset.timestamp;
      if (!timestampString) return;
      const timestamp = new Date(timestampString);
      el.textContent = getTimeAgo(timestamp);
    });
  }

  function deleteMessage(messageElement) {
    messageElement.remove();
    saveAppState();
    updatePlaceholderVisibility();
  }

  function renderChatHistory() {
    state.uiElements.chatContainer.innerHTML = "";
    if (!state.uiElements.chatPlaceholder) {
      console.error("chatPlaceholder element not found in DOM");
      return;
    }
    const hasMessages = state.chatHistory.some(
      (msg) =>
        msg.role === "user" ||
        msg.role === "assistant" ||
        msg.role === "error" ||
        msg.role === "assistant-cot"
    );
    if (!hasMessages) {
      state.uiElements.chatContainer.appendChild(
        state.uiElements.chatPlaceholder
      );
      state.uiElements.chatPlaceholder.style.display = "flex";
      return;
    } else {
      state.uiElements.chatPlaceholder.style.display = "none";
    }
    let lastUserElement = null;
    state.chatHistory.forEach((msg) => {
      if (msg.role === "system") return;
      if (msg.role === "user") {
        addMessage(msg.content, "user", null, null, null, true);
        lastUserElement = state.uiElements.chatContainer.lastElementChild;
      } else if (msg.role === "assistant") {
        addMessage(
          msg.content,
          "ai",
          lastUserElement,
          null,
          null,
          true,
          msg.processingTime
        );
      } else if (msg.role === "error") {
        addMessage(msg.content, "error", null, null, null, true);
      } else if (msg.role === "assistant-cot") {
        addMessage(msg.content, "ai-cot", null, null, null, true);
      }
    });
    scrollToBottomIfNeeded(true);
  }

  function updatePlaceholderVisibility() {
    const hasMessages =
      state.uiElements.chatContainer.querySelector(".message") !== null;
    if (state.uiElements.chatPlaceholder) {
      state.uiElements.chatPlaceholder.style.display = hasMessages
        ? "none"
        : "flex";
    } else {
      console.warn("chatPlaceholder element is missing in the DOM");
    }
  }

  /* ====================================================
   * Module: Event Handlers & UI Updates
   * ==================================================== */
  function initializeEventHandlers() {
    state.uiElements.fileUploadBtn?.addEventListener("click", () =>
      state.uiElements.fileInput.click()
    );
    state.uiElements.fileInput?.addEventListener("change", handleFileUpload);
    state.uiElements.modeButtons.forEach((btn) =>
      btn.addEventListener("click", () => handleModeChange(btn))
    );
    state.uiElements.detailPills.forEach((btn) =>
      btn.addEventListener("click", () => handleDetailChange(btn))
    );
    state.uiElements.modelPills.forEach((btn) =>
      btn.addEventListener("click", () => handleModelChange(btn))
    );
    state.uiElements.sendBtn?.addEventListener("click", sendMessage);
    state.uiElements.userInput?.addEventListener(
      "input",
      debounce(() => autoExpand(state.uiElements.userInput), 300)
    );
    state.uiElements.userInput?.addEventListener(
      "keydown",
      handleInputKeypress
    );
    document.getElementById("newChatBtn")?.addEventListener("click", showModal);
    state.uiElements.modalConfirm?.addEventListener("click", confirmNewChat);
    state.uiElements.modalCancel?.addEventListener("click", hideModal);
    window.addEventListener("click", handleWindowClick);
    document.addEventListener("keydown", handleEscapeKey);
  }

  function handleModeChange(button) {
    state.uiElements.modeButtons.forEach((btn) => {
      btn.classList.remove("active");
      btn.removeAttribute("aria-current");
    });
    button.classList.add("active");
    button.setAttribute("aria-current", "true");
    const newMode = button.dataset.mode;
    state.currentMode = newMode;
    const userName = state.userProfile?.name || "";
    const userLang = state.userProfile?.language || "english";
    state.chatHistory[0] = {
      role: "system",
      content:
        getSystemPrompt(newMode, userName, userLang) +
        "\n" +
        state.constants.detailPresets[state.currentDetail].instruction,
    };
    updateTemperature();
    animateElement(button);
    saveAppState();
  }

  function handleDetailChange(button) {
    state.uiElements.detailPills.forEach((btn) => {
      btn.classList.remove("active");
      btn.removeAttribute("aria-current");
    });
    button.classList.add("active");
    button.setAttribute("aria-current", "true");
    state.currentDetail = button.dataset.detail;
    const userName = state.userProfile?.name || "";
    const userLang = state.userProfile?.language || "english";
    state.chatHistory[0].content =
      getSystemPrompt(state.currentMode, userName, userLang) +
      "\n" +
      state.constants.detailPresets[state.currentDetail].instruction;
    animateElement(button);
    saveAppState();
  }

  function handleModelChange(button) {
    state.uiElements.modelPills.forEach((btn) => {
      btn.classList.remove("active");
      btn.removeAttribute("aria-current");
    });
    button.classList.add("active");
    button.setAttribute("aria-current", "true");
    state.currentModel = button.dataset.model;
    animateElement(button);
    saveAppState();
  }

  async function handleFileUpload(e) {
    const files = e.target.files;
    if (!files?.length) return;
    const allowedTypes = [
      "text/plain",
      "image/jpeg",
      "image/png",
      "text/markdown",
      "text/html",
      "application/javascript",
      "application/x-javascript",
      "text/css",
      "application/x-php",
      "text/x-python",
    ];
    try {
      for (const file of files) {
        if (!allowedTypes.includes(file.type)) {
          throw new Error(`Unsupported file type: ${file.type}`);
        }
        if (file.size > 512 * 1024) {
          throw new Error(`${file.name} exceeds 512KB limit`);
        }
        const content = await readFileContent(file);
        state.attachments.push({ name: file.name, type: file.type, content });
      }
      updateAttachmentPreviews();
      updatePlaceholderVisibility();
    } catch (error) {
      const errorContent = `File upload failed: ${error.message}`;
      state.chatHistory.push({ role: "error", content: errorContent });
      addMessage(errorContent, "error");
      updatePlaceholderVisibility();
    }
    e.target.value = "";
  }

  function handleInputKeypress(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function handleWindowClick(e) {
    if (e.target === state.uiElements.modal) hideModal();
  }

  function handleEscapeKey(e) {
    if (e.key === "Escape") {
      if (state.uiElements.modal.style.display === "flex") hideModal();
      const userProfileModal = document.getElementById("userProfileModal");
      if (userProfileModal && userProfileModal.style.display === "flex") {
        userProfileModal.style.display = "none";
      }
    }
  }

  function animateElement(element) {
    element.animate(state.constants.animationSettings.buttonPress, {
      duration: state.constants.animationSettings.duration,
      easing: "ease-out",
    });
  }

  function updateTemperature() {
    switch (state.currentMode) {
      case "creator":
        state.temperature = 1.2;
        break;
      case "coding":
        state.temperature = 0.0;
        break;
      default:
        state.temperature = 0.3;
    }
  }

  function showLoading() {
    const loading = document.createElement("div");
    loading.className = "loading";
    loading.innerHTML = `
          <span>Aurora is thinking</span>
          <div class="loading-dots">
            <div class="loading-dot"></div>
            <div class="loading-dot"></div>
            <div class="loading-dot"></div>
          </div>
        `;
    const container = state.uiElements.chatContainer;
    container.appendChild(loading);
    const threshold = 100;
    const scrollBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    if (scrollBottom <= threshold) {
      container.scrollTop = container.scrollHeight;
    }
  }

  function hideLoading() {
    const loading = document.querySelector(".loading");
    if (loading) loading.remove();
  }

  async function sendMessage() {
    const messageContent = state.uiElements.userInput.value.trim();
    if ((!messageContent && state.attachments.length === 0) || state.isLoading)
      return;
    const currentTime = Date.now();
    if (currentTime - state.lastMessageTime < 1000) return;
    state.lastMessageTime = currentTime;
    const currentMode = state.currentMode;
    const currentDetail = state.currentDetail;
    const currentModel = state.currentModel;
    let completeMessage = messageContent;
    if (state.attachments.length > 0) {
      completeMessage += "\n\n[Attachments]";
      state.attachments.forEach((att) => {
        completeMessage += `\nFILE: ${att.name}\n${att.content}\n`;
      });
    }
    const messagePayload = {
      text: completeMessage,
      attachments: state.attachments.map((att) => ({
        name: att.name,
        type: att.type,
        content: att.content,
      })),
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      settings: {
        mode: currentMode,
        currentDetail: currentDetail,
        model: currentModel,
      },
    };
    state.chatHistory.push({ role: "user", content: completeMessage });
    addMessage(
      completeMessage,
      "user",
      null,
      messagePayload.id,
      messagePayload.settings,
      true
    );
    const userMessageElement = state.uiElements.chatContainer.lastElementChild;
    state.pendingMessages.set(messagePayload.id, {
      element: userMessageElement,
      startTime: Date.now(),
      settings: messagePayload.settings,
    });
    state.uiElements.userInput.value = "";
    requestAnimationFrame(() => autoExpand(state.uiElements.userInput));
    state.attachments = [];
    updateAttachmentPreviews();
    try {
      state.isLoading = true;
      showLoading();
      const payload = {
        model: currentModel,
        messages: prepareMessagesForModel(),
        temperature: state.temperature,
        max_tokens: state.constants.detailPresets[currentDetail].tokens,
      };
      console.log("Sending payload:", payload);
      const response = await fetch(state.constants.apiEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${CONFIG.API_KEY}`,
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (err) {
          errorData = { error: { message: await response.text() } };
        }
        throw new Error(
          `API error: ${response.status} - ${
            errorData.error?.message || "Unknown error"
          }`
        );
      }
      let data;
      try {
        data = await response.json();
        console.log("API response:", data);
      } catch (parseError) {
        console.error("Error parsing JSON response:", parseError);
        throw new Error("Invalid JSON response from server");
      }
      const pendingObj = state.pendingMessages.get(messagePayload.id);
      const processingTime = pendingObj
        ? ((Date.now() - pendingObj.startTime) / 1000).toFixed(2)
        : "N/A";
      const finalAnswer =
        data.choices[0]?.message?.content || "No response received";
      addMessage(
        finalAnswer,
        "ai",
        null,
        messagePayload.id,
        messagePayload.settings,
        false,
        processingTime
      );
      state.chatHistory.push({
        role: "assistant",
        content: finalAnswer,
        processingTime: processingTime,
      });
      const chainOfThought = data.choices[0]?.message?.reasoning_content;
      if (chainOfThought) {
        addMessage(
          chainOfThought,
          "ai-cot",
          null,
          messagePayload.id,
          messagePayload.settings,
          false
        );
        state.chatHistory.push({
          role: "assistant-cot",
          content: chainOfThought,
        });
      }
    } catch (error) {
      console.error("Error in sendMessage:", error);
      const errorContent = `Error: ${error.message}`;
      state.chatHistory.push({ role: "error", content: errorContent });
      addMessage(errorContent, "error");
      state.pendingMessages.delete(messagePayload.id);
    } finally {
      state.isLoading = false;
      hideLoading();
      saveAppState();
    }
  }

  function prepareMessagesForModel() {
    if (state.currentModel === "deepseek-reasoner") {
      const systemMsg = state.chatHistory.find((m) => m.role === "system");
      const lastUserMsg = [...state.chatHistory]
        .reverse()
        .find((m) => m.role === "user");
      const result = [];
      if (systemMsg) result.push(systemMsg);
      if (lastUserMsg) result.push(lastUserMsg);
      return result;
    }
    return state.chatHistory.filter((m) =>
      ["system", "user", "assistant"].includes(m.role)
    );
  }

  /* ====================================================
   * Module: Modal & Misc UI Flow
   * ==================================================== */
  function showModal() {
    state.uiElements.modal.style.display = "flex";
  }
  function hideModal() {
    state.uiElements.modal.style.display = "none";
  }
  function confirmNewChat() {
    hideModal();
    localStorage.removeItem("appState");
    state.chatHistory = [];
    state.uiElements.chatContainer.innerHTML = "";
    state.uiElements.chatContainer.appendChild(
      state.uiElements.chatPlaceholder
    );
    updatePlaceholderVisibility();
    const userName = state.userProfile?.name || "";
    const userLang = state.userProfile?.language || "english";
    state.chatHistory.push({
      role: "system",
      content:
        getSystemPrompt("analyst", userName, userLang) +
        "\n" +
        state.constants.detailPresets.balanced.instruction,
    });
    state.currentMode = "analyst";
    state.currentDetail = "balanced";
    state.currentModel = "deepseek-chat";
    state.temperature = 0.0;
    resetModeButtons();
    updateModeUI();
    updateDetailUI();
    updateAttachmentPreviews();
    autoExpand(state.uiElements.userInput);
  }
  function resetModeButtons() {
    if (!state.uiElements.modeButtons) {
      console.error("Error: modeButtons not found in DOM.");
      return;
    }
    state.uiElements.modeButtons.forEach((btn) => {
      btn.classList.remove("active");
      btn.removeAttribute("aria-current");
    });
    const analystBtn = [...state.uiElements.modeButtons].find(
      (btn) => btn.dataset.mode === "analyst"
    );
    if (analystBtn) {
      analystBtn.classList.add("active");
      analystBtn.setAttribute("aria-current", "true");
      animateElement(analystBtn);
    } else {
      console.warn("Warning: Analyst mode button not found in DOM.");
    }
  }

  function updateModeUI() {
    state.uiElements.modeButtons.forEach((btn) => {
      btn.classList.remove("active");
      btn.removeAttribute("aria-current");
      if (btn.dataset.mode === state.currentMode) {
        btn.classList.add("active");
        btn.setAttribute("aria-current", "true");
      }
    });
  }

  function updateDetailUI() {
    state.uiElements.detailPills.forEach((btn) => {
      btn.classList.remove("active");
      btn.removeAttribute("aria-current");
      if (btn.dataset.detail === state.currentDetail) {
        btn.classList.add("active");
        btn.setAttribute("aria-current", "true");
      }
    });
  }

  function updateModelUI() {
    state.uiElements.modelPills.forEach((btn) => {
      btn.classList.remove("active");
      btn.removeAttribute("aria-current");
      if (btn.dataset.model === state.currentModel) {
        btn.classList.add("active");
        btn.setAttribute("aria-current", "true");
      }
    });
  }

  /* ====================================================
   * Module: Additional Event Listeners for Profile/Settings
   * ==================================================== */
  initializeEventHandlers();

  const userProfileModal = document.getElementById("userProfileModal");
  const userProfileForm = document.getElementById("userProfileForm");
  const profileCancelBtn = document.getElementById("profileCancel");
  const userNameInput = document.getElementById("userName");
  const userLanguageSelect = document.getElementById("userLanguage");

  state.uiElements.userSettingsBtn?.addEventListener("click", () => {
    state.uiElements.apiKeyInput.value = CONFIG.API_KEY;
    state.uiElements.settingsModal.style.display = "flex";
  });
  state.uiElements.settingsCancel?.addEventListener("click", () => {
    state.uiElements.settingsModal.style.display = "none";
  });
  state.uiElements.settingsForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const newApiKey = state.uiElements.apiKeyInput.value.trim();
    if (newApiKey) {
      CONFIG.API_KEY = newApiKey;
      localStorage.setItem("apiKey", newApiKey);
      console.info("API key updated successfully.");
    } else {
      console.warn("API key cannot be empty. No changes made.");
    }
    state.uiElements.settingsModal.style.display = "none";
  });
  state.uiElements.clearCacheBtn?.addEventListener("click", () => {
    if (
      confirm(
        "Are you sure you want to clear the cache and local storage? This will reset your chat history, user profile, and settings."
      )
    ) {
      localStorage.removeItem("appState");
      // Optionally reload the page:
      // location.reload();
    }
  });
  document.getElementById("userProfileBtn")?.addEventListener("click", () => {
    userNameInput.value = state.userProfile?.name || "";
    userLanguageSelect.value = state.userProfile?.language || "english";
    if (userProfileModal) userProfileModal.style.display = "flex";
  });
  profileCancelBtn?.addEventListener("click", () => {
    if (userProfileModal) userProfileModal.style.display = "none";
  });
  userProfileForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = userNameInput.value.trim();
    const language = userLanguageSelect.value;
    if (name) {
      state.userProfile.name = name;
      state.userProfile.language = language;
      localStorage.setItem("userProfile", JSON.stringify(state.userProfile));
      state.chatHistory[0].content =
        getSystemPrompt(state.currentMode, state.userProfile.name, language) +
        "\n" +
        state.constants.detailPresets[state.currentDetail].instruction;
    }
    if (userProfileModal) userProfileModal.style.display = "none";
  });

  /* ====================================================
   * Initialization: Render Chat and UI Setup
   * ==================================================== */
  renderChatHistory();
  updatePlaceholderVisibility();
  updateModeUI();
  updateDetailUI();
  updateModelUI();
  updateTemperature();
  // Set up interval to update timestamps every second
  setInterval(updateRelativeTimestamps, 1000);
});
