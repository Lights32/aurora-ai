document.addEventListener("DOMContentLoaded", () => {
  // --- Dependency Checks ---
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

  // -- External Configurations --
  // Load a saved API key from localStorage if available.
  const storedApiKey = localStorage.getItem("apiKey");
  // If a global CONFIG exists, use it; otherwise, create a new one.
  const CONFIG = window.CONFIG || {};
  // Overwrite or set the API_KEY property using localStorage if available.
  CONFIG.API_KEY =
    storedApiKey && storedApiKey !== "null"
      ? storedApiKey
      : CONFIG.API_KEY || "YOUR_API_KEY_HERE";

  if (CONFIG.API_KEY === "YOUR_API_KEY_HERE") {
    console.warn(
      "Warning: Using placeholder API key. Please set a valid API key via the settings modal."
    );
  }

  // Default system prompt fallback.
  const DEFAULT_SYSTEM_PROMPT = "You are Aurora, a helpful AI assistant.";

  // 1) Define your constants up front
  const CONSTANTS = {
    detailPresets: {
      concise: {
        instruction:
          "Provide a concise response, including key points without unnecessary elaboration.",
        tokens: 2048,
      },
      balanced: {
        instruction: "Deliver a balanced response, covering essential details.",
        tokens: 4096,
      },
      detailed: {
        instruction:
          "Offer a very detailed response, including comprehensive information, examples, and additional context the user might want.",
        tokens: 8192,
      },
      context: {
        instruction:
          "Provide an in-depth response with extensive context, examples, and clarifications, aswell as sources.",
        tokens: 8192,
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

  // 2) Load from local storage (if any)
  const savedState = loadAppState();

  // 3) Define a helper function that does NOT reference 'state'
  // Now accepts a language parameter instead of reading or modifying state.
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

  // 4) Define 'state' WITHOUT directly calling getSystemPrompt.
  const state = {
    currentMode: savedState?.currentMode || "analyst",
    temperature: savedState?.temperature || 0.0,
    pendingMessages: new Map(),
    chatHistory: [],
    currentDetail: savedState?.currentDetail || "balanced",
    currentModel: savedState?.currentModel || "deepseek-chat",
    isLoading: false,
    attachments: [],
    lastMessageTime: 0,
    userProfile: {}, // Will be filled via loadUserProfile()
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
      settingsBtn: document.getElementById("settingsBtn"),
    },
    constants: CONSTANTS,
  };

  // --- Check Critical DOM Elements ---
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

  // 5) Load user profile so we know the user’s name (if any)
  loadUserProfile(); // now state.userProfile is known
  // Apply the saved theme on page load
  loadThemePreference();

  // 6) Create or load chatHistory
  if (savedState?.chatHistory?.length) {
    // Use previously saved messages from state
    state.chatHistory = savedState.chatHistory;
  } else {
    // Brand new: create the system prompt with user name (if available) and language
    const userName = state.userProfile?.name || "";
    const userLang = state.userProfile?.language || "english";
    state.chatHistory = [
      {
        role: "system",
        content:
          getSystemPrompt(state.currentMode, userName, userLang) +
          "\n" +
          CONSTANTS.detailPresets.balanced.instruction,
      },
    ];
  }

  // Configure Markdown highlighting
  marked.setOptions({
    highlight: function (code, lang) {
      return hljs.highlightAuto(code).value;
    },
    langPrefix: "language-",
  });

  // 7) Continue your initialization
  renderChatHistory();
  updatePlaceholderVisibility();
  updateModeUI();
  updateDetailUI();
  updateModelUI();
  updateTemperature();

  // 8) Set up event listeners
  initializeEventHandlers();

  // 9) Handle user profile modal references
  const userProfileModal = document.getElementById("userProfileModal");
  const userProfileForm = document.getElementById("userProfileForm");
  const profileCancelBtn = document.getElementById("profileCancel");
  const userNameInput = document.getElementById("userName");
  const userLanguageSelect = document.getElementById("userLanguage");

  // --- Settings Modal Event Listeners ---
  // Open the settings modal when the settings button is clicked.
  state.uiElements.settingsBtn?.addEventListener("click", () => {
    // Pre-fill the API key input with the current API key.
    state.uiElements.apiKeyInput.value = CONFIG.API_KEY;
    // Display the settings modal.
    state.uiElements.settingsModal.style.display = "flex";
  });

  // Close the settings modal when the cancel button is clicked.
  state.uiElements.settingsCancel?.addEventListener("click", () => {
    state.uiElements.settingsModal.style.display = "none";
  });

  // Handle the settings form submission.
  state.uiElements.settingsForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    // Retrieve the new API key from the input.
    const newApiKey = state.uiElements.apiKeyInput.value.trim();
    if (newApiKey) {
      // Update the CONFIG API key and save it in localStorage for persistence.
      CONFIG.API_KEY = newApiKey;
      localStorage.setItem("apiKey", newApiKey);
      console.info("API key updated successfully.");
    } else {
      console.warn("API key cannot be empty. No changes made.");
    }
    // Hide the settings modal.
    state.uiElements.settingsModal.style.display = "none";
  });

  // Clear cache and local storage when the clear cache button is clicked.
  state.uiElements.clearCacheBtn?.addEventListener("click", () => {
    if (
      confirm(
        "Are you sure you want to clear the cache and local storage? This will reset your chat history, user profile, and settings."
      )
    ) {
      // Clear localStorage.
      localStorage.removeItem("appState");
      // Reload the page so that the application resets.
      // location.reload();
    }
  });

  // Open user profile modal
  document.getElementById("userProfileBtn")?.addEventListener("click", () => {
    userNameInput.value = state.userProfile?.name || "";
    userLanguageSelect.value = state.userProfile?.language || "english";
    if (userProfileModal) userProfileModal.style.display = "flex";
  });
  // Cancel = close modal
  profileCancelBtn?.addEventListener("click", () => {
    if (userProfileModal) userProfileModal.style.display = "none";
  });

  // Save user profile and update the system prompt accordingly
  userProfileForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = userNameInput.value.trim();
    const language = userLanguageSelect.value;

    if (name) {
      state.userProfile.name = name;
      state.userProfile.language = language;
      localStorage.setItem("userProfile", JSON.stringify(state.userProfile));

      // Update system prompt with new language and name
      state.chatHistory[0].content =
        getSystemPrompt(state.currentMode, state.userProfile.name, language) +
        "\n" +
        state.constants.detailPresets[state.currentDetail].instruction;
    }
    if (userProfileModal) userProfileModal.style.display = "none";
  });

  // ---------------------- Event Handlers & Core Functions ----------------------

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
    state.uiElements.userInput?.addEventListener("input", () => {
      autoExpand(state.uiElements.userInput);
    });
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

  // --- Mode, Detail & Model Switching ---

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
    // Update system prompt to include the updated detail preset
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

  // --- File Upload Handling ---

  async function handleFileUpload(e) {
    const files = e.target.files;
    if (!files?.length) return;

    const allowedTypes = [
      "text/plain", // .txt
      "image/jpeg", // .jpg, .jpeg
      "image/png", // .png
      "text/markdown", // .md
      "text/html", // .html
      "application/javascript", // .js
      "application/x-javascript",
      "text/css", // .css
      "application/x-php", // .php
      "text/x-python", // .py
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
        state.attachments.push({
          name: file.name,
          type: file.type,
          content,
        });
      }
      updateAttachmentPreviews();
      updatePlaceholderVisibility();
    } catch (error) {
      const errorContent = `File upload failed: ${error.message}`;
      // --- Save error message to chat history ---
      state.chatHistory.push({ role: "error", content: errorContent });
      addMessage(errorContent, "error");
      updatePlaceholderVisibility();
    }
    e.target.value = "";
  }

  // --- Prepare Messages for Model ---
  function prepareMessagesForModel() {
    if (state.currentModel === "deepseek-reasoner") {
      const systemMsg = state.chatHistory.find((m) => m.role === "system");
      // Find the last user message (searching from the end)
      const lastUserMsg = [...state.chatHistory]
        .reverse()
        .find((m) => m.role === "user");
      const result = [];
      if (systemMsg) result.push(systemMsg);
      if (lastUserMsg) result.push(lastUserMsg);
      return result;
    }
    // For the chat (standard) model, filter out unsupported message roles.
    return state.chatHistory.filter((m) =>
      ["system", "user", "assistant"].includes(m.role)
    );
  }

  // --- Send Message to the AI ---
  async function sendMessage() {
    // Get the text input and allow sending if there is text OR attachments.
    const messageContent = state.uiElements.userInput.value.trim();
    if ((!messageContent && state.attachments.length === 0) || state.isLoading)
      return;

    const currentTime = Date.now();
    if (currentTime - state.lastMessageTime < 1000) return; // throttle
    state.lastMessageTime = currentTime;

    const currentMode = state.currentMode;
    const currentcurrentDetail = state.currentDetail;
    const currentModel = state.currentModel;

    // Build the complete message text including attachments if any.
    let completeMessage = messageContent;
    if (state.attachments.length > 0) {
      completeMessage += "\n\n[Attachments]";
      state.attachments.forEach((att) => {
        completeMessage += `\nFILE: ${att.name}\n${att.content}\n`;
      });
    }

    // Create user message payload with the complete message text.
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
        currentDetail: currentcurrentDetail,
        model: currentModel,
      },
    };

    // Append the complete user message to chat history and render it.
    state.chatHistory.push({ role: "user", content: completeMessage });
    addMessage(
      completeMessage,
      "user",
      null,
      messagePayload.id,
      messagePayload.settings,
      true
    );

    // Remember where to insert the AI message.
    // Also, record the start time for processing.
    const userMessageElement = state.uiElements.chatContainer.lastElementChild;
    state.pendingMessages.set(messagePayload.id, {
      element: userMessageElement,
      startTime: Date.now(), // record processing start time
      settings: messagePayload.settings,
    });

    // Clear input and attachments
    state.uiElements.userInput.value = "";
    requestAnimationFrame(() => autoExpand(state.uiElements.userInput));
    state.attachments = [];
    updateAttachmentPreviews();

    // Send API request
    try {
      state.isLoading = true;
      showLoading();

      // Build your request payload
      const payload = {
        model: currentModel,
        messages: prepareMessagesForModel(),
        temperature: state.temperature,
        max_tokens: state.constants.detailPresets[currentcurrentDetail].tokens,
      };

      console.log("Sending payload:", payload); // <-- Log the payload

      const response = await fetch(state.constants.apiEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${CONFIG.API_KEY}`,
        },
        body: JSON.stringify(payload),
      });
      console.log("Sending payload:", payload); // <-- Log the payload

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

      // Compute processing time (in seconds) using the stored start time.
      const pendingObj = state.pendingMessages.get(messagePayload.id);
      const processingTime = pendingObj
        ? ((Date.now() - pendingObj.startTime) / 1000).toFixed(2)
        : "N/A";

      // Extract the final answer from the nested message property.
      const finalAnswer =
        data.choices[0]?.message?.content || "No response received";
      // Pass the processingTime as an extra parameter.
      addMessage(
        finalAnswer,
        "ai",
        null,
        messagePayload.id,
        messagePayload.settings,
        false,
        processingTime // processing time in seconds
      );
      state.chatHistory.push({
        role: "assistant",
        content: finalAnswer,
        processingTime: processingTime, // saving the processing time
      });

      // Check for chain-of-thought (CoT) content if available.
      const chainOfThought = data.choices[0]?.message?.reasoning_content;
      if (chainOfThought) {
        // Render the CoT as a separate message.
        addMessage(
          // '<i class="fas fa-brain"></i>&nbsp;' +
          //   "Thought Process\n" +
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
      // Save error message to chat history
      state.chatHistory.push({ role: "error", content: errorContent });
      addMessage(errorContent, "error");
      state.pendingMessages.delete(messagePayload.id);
    } finally {
      state.isLoading = false;
      hideLoading();
      saveAppState();
    }
  }

  // --- DOM Message Rendering ---
  // Modified addMessage to accept an optional processingTime parameter.
  function addMessage(
    content,
    type,
    insertAfter = null,
    messageId = null,
    settings = null,
    skipTyping = false,
    processingTime = null // New parameter for processing time
  ) {
    const frag = new DocumentFragment();
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${type}-message`;

    if (messageId && type === "user") {
      messageDiv.dataset.messageId = messageId;
    }

    // Determine if we should render a header or not.
    if (type === "ai-cot") {
      // Chain-of-Thought messages (without a header)
      messageDiv.innerHTML = `<span class="message-content"></span>`;
    } else {
      // Normal AI/User/Error messages with a header
      const modeLabel = settings?.mode || state.currentMode;
      const detailLabel = settings?.currentDetail || state.currentDetail;
      const modelLabel = settings?.model || state.currentModel;

      // **Processing Time Display for AI Responses**
      const processingTimeHTML =
        type === "ai" && processingTime
          ? `<span class="message-request-time" data-timestamp="${new Date().toISOString()}">
                ${processingTime}&nbsp;s
            </span>`
          : "";

      // **Token Estimation Display** (Hide for Error Messages)
      const estimatedTokens = Math.ceil(content.length / 4); // Rough estimate: 1 token = ~4 chars
      const tokenEstimateHTML =
        type !== "error"
          ? `<span class="message-token-estimate"><span style="color:var(--color-text-secondary);">♦&nbsp;</span>${estimatedTokens}&nbsp;Tokens</span>`
          : "";

      // **Message Header with "Time Ago"**
      messageDiv.innerHTML = `
        <div class="message-header">
          <span class="message-username">
            ${
              type === "user"
                ? state.userProfile?.name
                  ? `${state.userProfile.name} (You)`
                  : "You"
                : `<div>${modelLabel} → ${modeLabel}&nbsp;⚙</div>Aurora`
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

      document.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          const userInput = state.uiElements.userInput.value.trim();
          if (userInput === "/end") {
            cancelCurrentRequest();
            state.uiElements.userInput.value = ""; // Clear input
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
      // Render chain-of-thought message without header and without typing animation.
      contentElement.innerHTML = marked.parse(DOMPurify.sanitize(content));
    }

    frag.appendChild(messageDiv);

    // Insertion logic for AI messages (if they exist)
    if (type === "ai" && messageId) {
      const pendingObj = state.pendingMessages.get(messageId);
      if (pendingObj) {
        if (processingTime) {
          const requestTimeSpan = messageDiv.querySelector(
            ".message-request-time"
          );
          if (requestTimeSpan) {
            requestTimeSpan.textContent = `${processingTime} s`;
          }
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

    // Auto-scroll if near bottom.
    scrollToBottomIfNeeded();

    // **Ensure Timestamps Update Every 5 Seconds**
    updateRelativeTimestamps();
  }

  // Delete Message (uses state-based saving)
  function deleteMessage(messageElement) {
    messageElement.remove();
    saveAppState();
    updatePlaceholderVisibility();
  }

  // Re-render entire chat using state.chatHistory
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

  // Update placeholder visibility based on whether messages exist
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

  // --- Utility Functions ---

  // Auto-expand textarea
  function autoExpand(field) {
    const MIN_HEIGHT = 52;
    field.style.height = "auto";
    const computed = window.getComputedStyle(field);
    const maxH = parseFloat(computed.maxHeight) || 9999;
    const naturalH = Math.max(field.scrollHeight, MIN_HEIGHT);
    field.style.height = `${Math.min(naturalH, maxH)}px`;
    field.style.overflowY = naturalH >= maxH ? "auto" : "hidden";
  }

  // Typewriter effect for AI messages
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

  // Update timestamps every 5 seconds
  setInterval(updateRelativeTimestamps, 1000);
  function updateRelativeTimestamps() {
    document.querySelectorAll(".message-timestamp").forEach((el) => {
      const timestampString = el.dataset.timestamp;
      if (!timestampString) return;

      const timestamp = new Date(timestampString); // Correctly parse the stored timestamp
      el.textContent = getTimeAgo(timestamp);
    });
  }

  // Show file attachment previews
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

  // Remove file attachments (exposed globally)
  window.removeAttachment = function (index) {
    state.attachments.splice(index, 1);
    updateAttachmentPreviews();
  };

  // --- Modal Flow Functions ---
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

    resetModeButtons(); // Reset and apply .active class to Analyst button
    updateModeUI(); // Ensure UI reflects the change
    updateDetailUI();
    updateAttachmentPreviews();
    autoExpand(state.uiElements.userInput);
  }

  function resetModeButtons() {
    if (!state.uiElements.modeButtons) {
      console.error("Error: modeButtons not found in DOM.");
      return;
    }

    // Remove active state from all mode buttons
    state.uiElements.modeButtons.forEach((btn) => {
      btn.classList.remove("active");
      btn.removeAttribute("aria-current");
    });

    // Find and activate the correct mode button
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

  // --- UI Update Functions ---
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

  function handleWindowClick(e) {
    if (e.target === state.uiElements.modal) hideModal();
  }
  function handleEscapeKey(e) {
    if (e.key === "Escape") {
      if (state.uiElements.modal.style.display === "flex") {
        hideModal();
      }
      const userProfileModal = document.getElementById("userProfileModal");
      if (userProfileModal && userProfileModal.style.display === "flex") {
        userProfileModal.style.display = "none";
      }
    }
  }
  function handleInputKeypress(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  // --- Animation & Loading ---
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
        state.temperature = 0.3; // analyst
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

  // --- Time-Ago Display ---
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

  // --- State Persistence ---
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

  function loadAppState() {
    try {
      const stored = localStorage.getItem("appState");
      return stored ? JSON.parse(stored) : null;
    } catch (err) {
      console.warn("Failed to parse saved state:", err);
      return null;
    }
  }

  // --- Theme Preference ---
  function saveThemePreference(isDarkMode) {
    localStorage.setItem("themePreference", isDarkMode ? "dark" : "light");
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
  document.getElementById("themeToggleBtn")?.addEventListener("click", () => {
    const htmlElement = document.documentElement;
    const currentTheme = htmlElement.getAttribute("data-theme");
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    htmlElement.setAttribute("data-theme", newTheme);
    saveThemePreference(newTheme === "dark");
  });

  // --- User Profile Loading ---
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

  // --- SCROLL UTILITY FUNCTIONS ---
  // Ensures the chat container scrolls to the bottom if needed.
  function scrollToBottomIfNeeded(force = false) {
    const container = state.uiElements.chatContainer;
    if (!container) return;
    requestAnimationFrame(() => {
      if (force || isNearBottom(container)) {
        container.scrollTop = container.scrollHeight;
      }
    });
  }

  // Returns true if the container is near its bottom.
  function isNearBottom(container, threshold = 100) {
    return (
      container.scrollHeight - container.scrollTop - container.clientHeight <=
      threshold
    );
  }

  // --- TOKEN ESTIMATION ---
  function estimateTokenCount(text) {
    return Math.ceil(text.length / 4); // Approx. 1 token = 4 chars
  }
});
