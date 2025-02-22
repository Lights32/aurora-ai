document.addEventListener("DOMContentLoaded", () => {
  // --- Dependency Checker
  (function validateDependencies() {
    ["marked", "hljs", "DOMPurify"].forEach((dep) => {
      if (typeof window[dep] === "undefined") {
        console.error(
          `Error: The ${dep} library is not loaded. Please include it in your project.`
        );
      }
    });
  })();

  // --- Configure marked with HLJS for syntax highlighting
  marked.setOptions({
    breaks: true,
    highlight: (code, lang) =>
      lang && hljs.getLanguage(lang)
        ? hljs.highlight(code, { language: lang }).value
        : hljs.highlightAuto(code).value,
    langPrefix: "hljs language-",
  });

  // --- AuroraApp Object encapsulating appState, constants, and functions
  const AuroraApp = {
    configuration: {
      apiKey:
        localStorage.getItem("apiKey") ||
        (window.configuration && window.configuration.apiKey) ||
        "YOUR_API_KEY_HERE",
    },
    constants: {
      detailLevels: {
        concise: {
          instruction:
            "Present a succinct response that emphasizes the core points with clarity and brevity, avoiding extraneous details.",
          tokens: 8000,
        },
        balanced: {
          instruction:
            "Craft a well-rounded response that covers essential details and context in clear, direct language without overcomplicating the message.",
          tokens: 8000,
        },
        detailed: {
          instruction:
            "Deliver a comprehensive response that thoroughly explains the topic with extensive information, illustrative examples, and nuanced insights to fully address the query.",
          tokens: 8000,
        },
        context: {
          instruction:
            "Provide an in-depth response enriched with extensive background information, clarifications, illustrative examples, and supported by relevant sources for validation.",
          tokens: 8000,
        },
      },
      apiUrl: "https://api.deepseek.com/v1/chat/completions",
      animationSettings: {
        buttonPress: [
          { transform: "scale(1)" },
          { transform: "scale(0.96)" },
          { transform: "scale(1)" },
        ],
        duration: 300,
      },
    },
    appState: {
      activeMode: "analyst",
      responseTemperature: 0.6,
      pendingMessages: new Map(),
      chatHistory: [],
      currentDetailLevel: "balanced",
      activeModel: "deepseek-chat",
      isLoading: false,
      attachments: [],
      lastMessageTimestamp: 0,
      userProfile: {},
      uiElements: {},
    },
    initializeApp() {
      this.validateApiKey();
      this.loadAppState();
      this.cacheDomElements();
      this.validateCriticalElements();
      this.loadUserProfile();
      this.loadThemePreference();
      this.initializeChatHistory();
      this.attachEventListeners();
      this.renderChatHistory();
      this.refreshUIStates();
      setInterval(this.updateTimestamps.bind(this), 1000);
    },
    validateApiKey() {
      if (this.configuration.apiKey === "SK-DEMO") {
        console.warn(
          "Warning: Please set a valid API key via the settings modal dialog!"
        );
      }
    },
    loadAppState() {
      try {
        const stored = localStorage.getItem("appState");
        const saved = stored ? JSON.parse(stored) : {};
        Object.assign(this.appState, saved);
      } catch (err) {
        console.warn("Failed to parse saved appState:", err);
      }
    },
    cacheDomElements() {
      const uiElements = this.appState.uiElements;
      uiElements.modeToggleButtons = document.querySelectorAll(
        ".mode-toggle-button"
      );
      uiElements.modeSelectDropdown =
        document.getElementById("modeSelectDropdown");
      uiElements.chatWindow = document.getElementById("chatWindow");
      uiElements.chatPlaceholderElement = document.getElementById(
        "chatPlaceholderElement"
      );
      uiElements.messageInputField =
        document.getElementById("messageInputField");
      uiElements.sendButton = document.getElementById("sendButton");
      uiElements.confirmationModal =
        document.getElementById("confirmationModal");
      uiElements.confirmModalButton =
        document.getElementById("confirmModalButton");
      uiElements.cancelModalButton =
        document.getElementById("cancelModalButton");
      uiElements.uploadButton = document.getElementById("uploadButton");
      uiElements.fileInputElement = document.getElementById("fileInputElement");
      uiElements.detailLevelButtons = document.querySelectorAll(
        ".detail-level-button"
      );
      uiElements.modelSelectionButtons = document.querySelectorAll(
        ".model-selection-button"
      );
      uiElements.modelSelectDropdown = document.getElementById(
        "modelSelectDropdown"
      );
      uiElements.settingsModalDialog = document.getElementById(
        "settingsModalDialog"
      );
      uiElements.settingsFormElement = document.getElementById(
        "settingsFormElement"
      );
      uiElements.cancelSettingsButton = document.getElementById(
        "cancelSettingsButton"
      );
      uiElements.apiKeyInputField = document.getElementById("apiKeyInputField");
      uiElements.clearCacheButton = document.getElementById("clearCacheButton");
      uiElements.userSettingsButton =
        document.getElementById("userSettingsButton");
    },
    validateCriticalElements() {
      const uiElements = this.appState.uiElements;
      if (!uiElements.chatWindow) {
        console.error("Error: 'chatWindow' element not found in DOM.");
        return;
      }
      if (!uiElements.messageInputField) {
        console.error("Error: 'messageInputField' element not found in DOM.");
        return;
      }
      if (!uiElements.sendButton) {
        console.error("Error: 'sendButton' element not found in DOM.");
        return;
      }
      if (!uiElements.chatPlaceholderElement) {
        console.warn(
          "Warning: 'chatPlaceholderElement' element not found in DOM. Some UI elements may not display correctly."
        );
      }
    },
    loadUserProfile() {
      try {
        const storedProfile = localStorage.getItem("userProfile");
        this.appState.userProfile = storedProfile
          ? JSON.parse(storedProfile)
          : { language: "english" };
        if (!this.appState.userProfile.language) {
          this.appState.userProfile.language = "english";
        }
      } catch (err) {
        console.warn("Failed to parse user profile:", err);
        this.appState.userProfile = { language: "english" };
      }
    },
    loadThemePreference() {
      const savedTheme = localStorage.getItem("themePreference");
      document.documentElement.setAttribute(
        "data-theme",
        savedTheme === "dark" ? "dark" : "light"
      );
    },
    initializeChatHistory() {
      if (!this.appState.chatHistory.length) {
        const { name = "", language = "english" } = this.appState.userProfile;
        this.appState.chatHistory.push({
          role: "system",
          content:
            this.generateSystemPrompt(
              this.appState.activeMode,
              name,
              language
            ) +
            "\n" +
            this.constants.detailLevels.balanced.instruction,
        });
      }
    },
    generateSystemPrompt(mode, profileNameInput = "", language = "english") {
      const namePart = profileNameInput
        ? `The user's name is ${profileNameInput}.  `
        : "";
      const languageMap = {
        english:
          "The user's primary language is English. From now on, reply in English.",
        german:
          "The user's primary language is German. From now on, reply in German.",
      };
      const languageInstruction = languageMap[language] || languageMap.english;
      const prompts = {
        coding: `You are Aurora, an advanced AI assistant specializing in coding. You provide expert guidance on creating, modifying, optimizing, and managing code files and projects. Always perform a detailed analysis of provided code and maintain a clear, chronological record of all changes. When answering, structure your output with clear headings, subheadings, and bullet points where appropriate. Present code within well-formatted code blocks, include concise inline comments, and explain your thought process in plain language. Your responses should be both precise and accessible to intermediate web developers and beginner programmers. ${namePart}${languageInstruction}`,
        creator: `You are Aurora, an advanced AI assistant specializing in art and media creation. You provide insightful, creative guidance from conceptualization to production, balancing innovation with practical execution. Structure your responses with clear sections—begin with an overview, then break down your creative strategy, techniques, and any required steps. Use descriptive language, include visual references or design suggestions as needed, and format your output using bullet points, numbered lists, and headers for clarity. Ensure that your output is both inspirational and actionable. ${namePart}${languageInstruction}`,
        analyst: `You are Aurora, an advanced AI assistant specializing in analysis and advice on science, finance, and legal topics. Provide comprehensive, evidence-based insights supported by credible sources. Structure your output with a clear introduction, detailed analysis sections, and a concise conclusion. Use subheadings and bullet points to organize information, and include citations where applicable. Your analysis should be logically organized, transparent, and easily navigable, ensuring that all key points are clearly articulated and supported by evidence. ${namePart}${languageInstruction}`,
      };
      return prompts[mode] || prompts.analyst;
    },
    saveAppState() {
      const dataToSave = {
        chatHistory: this.appState.chatHistory,
        activeMode: this.appState.activeMode,
        currentDetailLevel: this.appState.currentDetailLevel,
        activeModel: this.appState.activeModel,
        responseTemperature: this.appState.responseTemperature,
        userProfile: this.appState.userProfile,
      };
      localStorage.setItem("appState", JSON.stringify(dataToSave));
    },
    // --- Utility Functions
    debounce(func, delay) {
      let timer;
      return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => func.apply(this, args), delay);
      };
    },
    autoExpand(field) {
      const MIN_HEIGHT = 52;
      field.style.height = "auto";
      const computed = window.getComputedStyle(field);
      const maxH = parseFloat(computed.maxHeight) || 9999;
      const naturalH = Math.max(field.scrollHeight, MIN_HEIGHT);
      field.style.height = `${Math.min(naturalH, maxH)}px`;
      field.style.overflowY = naturalH >= maxH ? "auto" : "hidden";
    },
    animateTyping(element, rawText, onComplete, charsPerTick = 1, delay = 1) {
      let index = 0;
      let tempBuffer = "";
      const length = rawText.length;
      const typeChunk = () => {
        if (index < length) {
          tempBuffer += rawText.slice(index, index + charsPerTick);
          const sanitized = DOMPurify.sanitize(tempBuffer);
          element.innerHTML = marked.parseInline(sanitized);
          this.attachCursor(element);
          this.scrollToBottomIfNeeded();
          index += charsPerTick;
          setTimeout(typeChunk, delay);
        } else {
          element.innerHTML = marked.parse(DOMPurify.sanitize(rawText));
          this.removeCursor(element);
          this.scrollToBottomIfNeeded();
          this.highlightCodeBlocks(element);
          this.addCopyButtons(element);
          if (typeof onComplete === "function") onComplete();
        }
      };
      typeChunk();
    },
    attachCursor(element) {
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
    },
    removeCursor(element) {
      const cursor = element.querySelector(".fake-cursor");
      if (cursor) cursor.remove();
    },
    highlightCodeBlocks(element) {
      element.querySelectorAll("pre code").forEach((block) => {
        hljs.highlightElement(block);
      });
    },
    addCopyButtons(element) {
      element.querySelectorAll("pre").forEach((pre) => {
        if (pre.querySelector(".copy-button")) return;
        const copyButton = document.createElement("button");
        copyButton.className = "copy-button";
        copyButton.innerHTML = '<i class="fas fa-copy"></i>';
        copyButton.addEventListener("click", (event) => {
          event.stopPropagation();
          const codeText = pre.innerText;
          navigator.clipboard
            .writeText(codeText)
            .then(() => {
              copyButton.innerHTML = '<i class="fas fa-check"></i>';
              setTimeout(() => {
                copyButton.innerHTML = '<i class="fas fa-copy"></i>';
              }, 2000);
            })
            .catch((err) => {
              console.error("Failed to copy text: ", err);
            });
        });
        pre.appendChild(copyButton);
      });
    },
    getRelativeTime(date) {
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
    },
    scrollToBottomIfNeeded(force = false) {
      const container = this.appState.uiElements.chatWindow;
      if (!container) return;
      requestAnimationFrame(() => {
        if (force || this.isNearBottom(container)) {
          container.scrollTop = container.scrollHeight;
        }
      });
    },
    isNearBottom(container, threshold = 100) {
      return (
        container.scrollHeight - container.scrollTop - container.clientHeight <=
        threshold
      );
    },
    estimateTokenCount(text) {
      return Math.ceil(text.length / 4);
    },
    // --- Attachment Preview and File Reading
    updateAttachmentPreviews() {
      const container = document.getElementById("attachmentPreviews");
      if (!container) return;
      container.innerHTML = "";
      this.appState.attachments.forEach((attachment, idx) => {
        const preview = document.createElement("div");
        preview.className = "attachment-preview";
        preview.innerHTML = `<span>${attachment.name}</span>
            <button onclick="deleteAttachment(${idx})">
              <i class="fas fa-times"></i>
            </button>`;
        container.appendChild(preview);
      });
    },
    async readFileContent(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (file.type.startsWith("image/")) {
            resolve(`![Uploaded Image](${e.target.result})`);
          } else {
            resolve(
              `**Uploaded File (${file.name}):**\n\n${e.target.result}\n`
            );
          }
        };
        reader.onerror = reject;
        file.type.startsWith("image/")
          ? reader.readAsDataURL(file)
          : reader.readAsText(file);
      });
    },
    // --- Message Rendering & Chat History
    appendMessage(content, type, options = {}) {
      const {
        insertAfter = null,
        messageId = null,
        settings = null,
        skipTyping = false,
        processingTime = null,
        onComplete = null,
      } = options;
      const frag = new DocumentFragment();
      const messageDiv = document.createElement("div");
      messageDiv.className = `message ${type}-message`;
      if (messageId && type === "user")
        messageDiv.dataset.messageId = messageId;

      const timestampISO = new Date().toISOString();
      const timeAgo = this.getRelativeTime(new Date());
      let headerHTML = "";
      if (type === "user") {
        headerHTML = `<div class="message-header">
            <span class="message-username">${
              this.appState.userProfile?.name
                ? this.appState.userProfile.name + " (You)"
                : "You"
            }</span>
            <div class="row">
              <span class="message-timestamp" data-timestamp="${timestampISO}">${timeAgo}</span>
            </div>
          </div>`;
      } else if (["ai", "assistant", "ai-cot"].includes(type)) {
        const modeLabel = settings?.mode || this.appState.activeMode;
        const estimatedTokens = this.estimateTokenCount(content);
        const processingTimeHTML =
          type === "ai" && processingTime
            ? `<span class="message-request-time">${processingTime}&nbsp;s</span>`
            : "";
        const tokenEstimateHTML = `<span class="message-token-estimate"><span style="color:var(--color-text-secondary);">♦&nbsp;</span>${estimatedTokens}&nbsp;Tokens</span>`;
        const username =
          type === "ai-cot" ? "Reasoning" : `<div>Aurora → ${modeLabel}</div>`;
        headerHTML = `<div class="message-header">
            <span class="message-username">${username}</span>
            <div class="row">
              ${processingTimeHTML}
              ${tokenEstimateHTML}
              <span class="message-timestamp" data-timestamp="${timestampISO}">${timeAgo}</span>
            </div>
          </div>`;
      }
      messageDiv.innerHTML = `${headerHTML}<span class="message-content"></span>`;
      const contentElement = messageDiv.querySelector(".message-content");

      if (["user", "error"].includes(type)) {
        const parsedContent =
          type === "error"
            ? DOMPurify.sanitize(content)
            : marked.parse(DOMPurify.sanitize(content));
        contentElement.innerHTML = parsedContent;
        this.highlightCodeBlocks(contentElement);
        this.addCopyButtons(contentElement);
      } else if (["ai", "ai-cot"].includes(type)) {
        messageDiv.classList.add("typing");
        if (skipTyping) {
          contentElement.innerHTML = marked.parse(DOMPurify.sanitize(content));
          messageDiv.classList.remove("typing");
        } else {
          this.animateTyping(contentElement, content, () => {
            contentElement.innerHTML = marked.parse(
              DOMPurify.sanitize(content)
            );
            messageDiv.classList.remove("typing");
            if (typeof onComplete === "function") onComplete();
          });
        }
      }

      frag.appendChild(messageDiv);
      if (insertAfter) {
        insertAfter.after(frag);
      } else {
        this.appState.uiElements.chatWindow.appendChild(frag);
      }
      this.scrollToBottomIfNeeded();
      this.updateTimestamps();
      this.updatePlaceholderVisibility();
    },
    updateTimestamps() {
      document.querySelectorAll(".message-timestamp").forEach((el) => {
        const timestampString = el.dataset.timestamp;
        if (!timestampString) return;
        el.textContent = this.getRelativeTime(new Date(timestampString));
      });
    },
    removeMessage(messageElement) {
      messageElement.remove();
      this.saveAppState();
      this.updatePlaceholderVisibility();
    },
    renderChatHistory() {
      const uiElements = this.appState.uiElements;
      uiElements.chatWindow.innerHTML = "";
      if (!uiElements.chatPlaceholderElement) {
        console.error("chatPlaceholderElement element not found in DOM");
        return;
      }
      const hasMessages = this.appState.chatHistory.some((msg) =>
        ["user", "assistant", "error", "assistant-cot"].includes(msg.role)
      );
      if (!hasMessages) {
        uiElements.chatWindow.appendChild(uiElements.chatPlaceholderElement);
        uiElements.chatPlaceholderElement.style.display = "flex";
        return;
      } else {
        uiElements.chatPlaceholderElement.style.display = "none";
      }
      this.appState.chatHistory.forEach((msg) => {
        if (msg.role === "system") return;
        const opts = { skipTyping: true };
        if (msg.role === "user") {
          this.appendMessage(msg.content, "user", opts);
        } else if (msg.role === "assistant") {
          opts.processingTime = msg.processingTime;
          this.appendMessage(msg.content, "ai", opts);
        } else if (msg.role === "error") {
          this.appendMessage(msg.content, "error", opts);
        } else if (msg.role === "assistant-cot") {
          this.appendMessage(msg.content, "ai-cot", opts);
        }
      });
      this.scrollToBottomIfNeeded(true);
    },
    updatePlaceholderVisibility() {
      const hasMessages =
        this.appState.uiElements.chatWindow.querySelector(".message") !== null;
      if (this.appState.uiElements.chatPlaceholderElement) {
        this.appState.uiElements.chatPlaceholderElement.style.display =
          hasMessages ? "none" : "flex";
      } else {
        console.warn("chatPlaceholderElement element is missing in the DOM");
      }
    },
    // --- Event Handlers & UI Updates
    onModeChange(element) {
      const newMode =
        element.tagName === "SELECT" ? element.value : element.dataset.mode;
      this.appState.activeMode = newMode;
      this.updateModeUI();
      const { name = "", language = "english" } = this.appState.userProfile;
      this.appState.chatHistory[0] = {
        role: "system",
        content:
          this.generateSystemPrompt(newMode, name, language) +
          "\n" +
          this.constants.detailLevels[this.appState.currentDetailLevel]
            .instruction,
      };
      this.updateResponseTemperature();
      this.animateElement(element);
      this.saveAppState();
    },
    onModelChange(element) {
      const newModel =
        element.tagName === "SELECT" ? element.value : element.dataset.model;
      this.appState.activeModel = newModel;
      this.updateModelUI();
      this.animateElement(element);
      this.saveAppState();
    },
    onDetailLevelChange(event) {
      const button = event.currentTarget;
      this.appState.uiElements.detailLevelButtons.forEach((btn) => {
        console.log("Detail level button clicked:", button.dataset.detail);
        btn.classList.remove("active");
        btn.removeAttribute("aria-current");
      });
      button.classList.add("active");
      button.setAttribute("aria-current", "true");
      this.appState.currentDetailLevel = button.dataset.detail;
      const { name = "", language = "english" } = this.appState.userProfile;
      this.appState.chatHistory[0].content =
        this.generateSystemPrompt(this.appState.activeMode, name, language) +
        "\n" +
        this.constants.detailLevels[this.appState.currentDetailLevel]
          .instruction;
      this.animateElement(button);
      this.saveAppState();
    },
    async handleFileUpload(e) {
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
          const content = await this.readFileContent(file);
          this.appState.attachments.push({
            name: file.name,
            type: file.type,
            content,
          });
        }
        this.updateAttachmentPreviews();
        this.updatePlaceholderVisibility();
      } catch (error) {
        const errorContent = `File upload failed: ${error.message}`;
        this.appState.chatHistory.push({
          role: "error",
          content: errorContent,
        });
        this.appendMessage(errorContent, "error");
        this.updatePlaceholderVisibility();
      }
      e.target.value = "";
    },
    handleInputKeyPress(e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    },
    onWindowClick(e) {
      if (e.target === this.appState.uiElements.confirmationModal)
        this.hideModal();
    },
    onEscapeKey(e) {
      if (e.key === "Escape") {
        if (this.appState.uiElements.confirmationModal.style.display === "flex")
          this.hideModal();
        const profileModalDialog =
          document.getElementById("profileModalDialog");
        if (profileModalDialog && profileModalDialog.style.display === "flex") {
          profileModalDialog.style.display = "none";
        }
      }
    },
    animateElement(element) {
      element.animate(this.constants.animationSettings.buttonPress, {
        duration: this.constants.animationSettings.duration,
        easing: "ease-out",
      });
    },
    updateResponseTemperature() {
      switch (this.appState.activeMode) {
        case "creator":
          this.appState.responseTemperature = 1.2;
          break;
        case "coding":
          this.appState.responseTemperature = 0.0;
          break;
        default:
          this.appState.responseTemperature = 0.6;
      }
    },
    showLoadingIndicator() {
      const loading = document.createElement("div");
      loading.className = "loading";
      loading.innerHTML = `<span>Aurora is thinking</span>
            <div class="loading-dots">
              <div class="loading-dot"></div>
              <div class="loading-dot"></div>
              <div class="loading-dot"></div>
            </div>`;
      const container = this.appState.uiElements.chatWindow;
      container.appendChild(loading);
      if (
        container.scrollHeight - container.scrollTop - container.clientHeight <=
        100
      ) {
        container.scrollTop = container.scrollHeight;
      }
    },
    hideLoadingIndicator() {
      const loading = document.querySelector(".loading");
      if (loading) loading.remove();
    },
    async sendMessage() {
      const messageContent =
        this.appState.uiElements.messageInputField.value.trim();
      if (
        (!messageContent && this.appState.attachments.length === 0) ||
        this.appState.isLoading
      )
        return;
      const currentTime = Date.now();
      if (currentTime - this.appState.lastMessageTimestamp < 1000) return;
      this.appState.lastMessageTimestamp = currentTime;
      const { activeMode, currentDetailLevel, activeModel } = this.appState;
      let completeMessage = messageContent;
      if (this.appState.attachments.length > 0) {
        completeMessage += "\n\n[Attachments]";
        this.appState.attachments.forEach((att) => {
          completeMessage += `\nFILE: ${att.name}\n${att.content}\n`;
        });
      }
      const messagePayload = {
        text: completeMessage,
        attachments: this.appState.attachments.map((att) => ({
          name: att.name,
          type: att.type,
          content: att.content,
        })),
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        settings: {
          mode: activeMode,
          currentDetailLevel: currentDetailLevel,
          model: activeModel,
        },
      };
      this.appState.chatHistory.push({
        role: "user",
        content: completeMessage,
      });
      this.appendMessage(completeMessage, "user", {
        skipTyping: true,
        messageId: messagePayload.id,
        settings: messagePayload.settings,
      });
      this.scrollToBottomIfNeeded(true);
      const userMessageElement =
        this.appState.uiElements.chatWindow.lastElementChild;
      this.appState.pendingMessages.set(messagePayload.id, {
        element: userMessageElement,
        startTime: Date.now(),
        settings: messagePayload.settings,
      });
      this.appState.uiElements.messageInputField.value = "";
      requestAnimationFrame(() =>
        this.autoExpand(this.appState.uiElements.messageInputField)
      );
      this.appState.attachments = [];
      this.updateAttachmentPreviews();
      try {
        this.appState.isLoading = true;
        this.showLoadingIndicator();
        const payload = {
          model: activeModel,
          messages: this.prepareMessagesForAPI(),
          temperature: this.appState.responseTemperature,
          max_tokens: this.constants.detailLevels[currentDetailLevel].tokens,
        };
        console.log("Sending payload:", payload);
        const response = await fetch(this.constants.apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.configuration.apiKey}`,
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
        const pendingObj = this.appState.pendingMessages.get(messagePayload.id);
        const processingTime = pendingObj
          ? ((Date.now() - pendingObj.startTime) / 1000).toFixed(2)
          : "N/A";
        const finalAnswer =
          data.choices[0]?.message?.content || "No response received";
        const chainOfThought = data.choices[0]?.message?.reasoning_content;
        if (chainOfThought) {
          this.appState.chatHistory.push({
            role: "assistant-cot",
            content: chainOfThought,
          });
          this.appState.chatHistory.push({
            role: "assistant",
            content: finalAnswer,
            processingTime: processingTime,
          });
          this.appendMessage(chainOfThought, "ai-cot", {
            messageId: messagePayload.id,
            settings: messagePayload.settings,
            skipTyping: false,
            onComplete: () => {
              this.appendMessage(finalAnswer, "ai", {
                messageId: messagePayload.id,
                settings: messagePayload.settings,
                skipTyping: false,
                processingTime: processingTime,
              });
            },
          });
        } else {
          this.appState.chatHistory.push({
            role: "assistant",
            content: finalAnswer,
            processingTime: processingTime,
          });
          this.appendMessage(finalAnswer, "ai", {
            messageId: messagePayload.id,
            settings: messagePayload.settings,
            skipTyping: false,
            processingTime: processingTime,
          });
        }
      } catch (error) {
        console.error("Error in sendMessage:", error);
        const errorContent = `Error: ${error.message}`;
        this.appState.chatHistory.push({
          role: "error",
          content: errorContent,
        });
        this.appendMessage(errorContent, "error");
        this.appState.pendingMessages.delete(messagePayload.id);
      } finally {
        this.appState.isLoading = false;
        this.hideLoadingIndicator();
        this.saveAppState();
      }
    },
    prepareMessagesForAPI() {
      if (this.appState.activeModel === "deepseek-reasoner") {
        const systemMsg = this.appState.chatHistory.find(
          (m) => m.role === "system"
        );
        const lastUserMsg = [...this.appState.chatHistory]
          .reverse()
          .find((m) => m.role === "user");
        return [systemMsg, lastUserMsg].filter(Boolean);
      }
      return this.appState.chatHistory.filter((m) =>
        ["system", "user", "assistant"].includes(m.role)
      );
    },
    // --- Modal & Misc UI Flow
    displayModal() {
      this.appState.uiElements.confirmationModal.style.display = "flex";
    },
    hideModal() {
      this.appState.uiElements.confirmationModal.style.display = "none";
    },
    confirmNewChat() {
      this.hideModal();
      localStorage.removeItem("appState");
      this.appState.chatHistory = [];
      this.appState.uiElements.chatWindow.innerHTML = "";
      this.appState.uiElements.chatWindow.appendChild(
        this.appState.uiElements.chatPlaceholderElement
      );
      this.updatePlaceholderVisibility();
      const { name = "", language = "english" } = this.appState.userProfile;
      this.appState.chatHistory.push({
        role: "system",
        content:
          this.generateSystemPrompt("analyst", name, language) +
          "\n" +
          this.constants.detailLevels.balanced.instruction,
      });
      this.appState.activeMode = "analyst";
      this.appState.currentDetailLevel = "balanced";
      this.appState.activeModel = "deepseek-chat";
      this.appState.responseTemperature = 0.6;
      this.resetModeButtons();
      this.updateModeUI();
      this.updateDetailUI();
      this.updateModelUI();
      this.updateAttachmentPreviews();
      this.autoExpand(this.appState.uiElements.messageInputField);
    },
    resetModeButtons() {
      if (!this.appState.uiElements.modeToggleButtons) {
        console.error("Error: modeToggleButtons not found in DOM.");
        return;
      }
      this.appState.uiElements.modeToggleButtons.forEach((btn) => {
        btn.classList.remove("active");
        btn.removeAttribute("aria-current");
      });
      const analystBtn = Array.from(
        this.appState.uiElements.modeToggleButtons
      ).find((btn) => btn.dataset.mode === "analyst");
      if (analystBtn) {
        analystBtn.classList.add("active");
        analystBtn.setAttribute("aria-current", "true");
        this.animateElement(analystBtn);
      } else {
        console.warn("Warning: Analyst mode button not found in DOM.");
      }
    },
    updateModeUI() {
      this.appState.uiElements.modeToggleButtons.forEach((btn) => {
        btn.classList.toggle(
          "active",
          btn.dataset.mode === this.appState.activeMode
        );
        btn.toggleAttribute(
          "aria-current",
          btn.dataset.mode === this.appState.activeMode
        );
      });
      if (this.appState.uiElements.modeSelectDropdown) {
        this.appState.uiElements.modeSelectDropdown.value =
          this.appState.activeMode;
      }
    },
    updateDetailUI() {
      this.appState.uiElements.detailLevelButtons.forEach((btn) => {
        btn.classList.toggle(
          "active",
          btn.dataset.detail === this.appState.currentDetailLevel
        );
        btn.toggleAttribute(
          "aria-current",
          btn.dataset.detail === this.appState.currentDetailLevel
        );
      });
    },
    updateModelUI() {
      this.appState.uiElements.modelSelectionButtons.forEach((btn) => {
        btn.classList.toggle(
          "active",
          btn.dataset.model === this.appState.activeModel
        );
        btn.toggleAttribute(
          "aria-current",
          btn.dataset.model === this.appState.activeModel
        );
      });
      if (this.appState.uiElements.modelSelectDropdown) {
        this.appState.uiElements.modelSelectDropdown.value =
          this.appState.activeModel;
      }
    },
    attachEventListeners() {
      const uiElements = this.appState.uiElements;
      uiElements.uploadButton?.addEventListener("click", () =>
        uiElements.fileInputElement.click()
      );
      uiElements.fileInputElement?.addEventListener(
        "change",
        this.handleFileUpload.bind(this)
      );
      uiElements.modeToggleButtons.forEach((btn) =>
        btn.addEventListener("click", () => this.onModeChange(btn))
      );
      uiElements.detailLevelButtons.forEach((btn) =>
        btn.addEventListener("click", (event) =>
          this.onDetailLevelChange(event)
        )
      );
      uiElements.modelSelectionButtons.forEach((btn) =>
        btn.addEventListener("click", (event) => {
          console.log("Model changed to:", event.target.dataset.model);
          AuroraApp.onModelChange(event.target);
        })
      );
      uiElements.sendButton?.addEventListener(
        "click",
        this.sendMessage.bind(this)
      );
      uiElements.messageInputField?.addEventListener(
        "input",
        this.debounce(() => this.autoExpand(uiElements.messageInputField), 300)
      );
      uiElements.messageInputField?.addEventListener(
        "keydown",
        this.handleInputKeyPress.bind(this)
      );
      document
        .getElementById("newChatButton")
        ?.addEventListener("click", this.displayModal.bind(this));
      uiElements.confirmModalButton?.addEventListener(
        "click",
        this.confirmNewChat.bind(this)
      );
      uiElements.cancelModalButton?.addEventListener(
        "click",
        this.hideModal.bind(this)
      );
      window.addEventListener("click", this.onWindowClick.bind(this));
      document.addEventListener("keydown", this.onEscapeKey.bind(this));
      if (uiElements.modeSelectDropdown) {
        uiElements.modeSelectDropdown.addEventListener("change", (e) =>
          this.onModeChange(e.currentTarget)
        );
      }
      if (uiElements.modelSelectDropdown) {
        uiElements.modelSelectDropdown.addEventListener("change", (e) =>
          this.onModelChange(e.currentTarget)
        );
      }
      // --- Settings & Profile Events
      uiElements.userSettingsButton?.addEventListener("click", () => {
        uiElements.apiKeyInputField.value = this.configuration.apiKey;
        uiElements.settingsModalDialog.style.display = "flex";
      });
      uiElements.cancelSettingsButton?.addEventListener("click", () => {
        uiElements.settingsModalDialog.style.display = "none";
      });
      uiElements.settingsFormElement?.addEventListener("submit", (e) => {
        e.preventDefault();
        console.log("Saving API Key …");
        const newApiKey = uiElements.apiKeyInputField.value.trim();
        if (newApiKey) {
          this.configuration.apiKey = newApiKey;
          localStorage.setItem("apiKey", newApiKey);
          console.info("API key updated successfully.");
        } else {
          console.warn("API key cannot be empty. No changes made.");
        }
        const themeSelect = document.getElementById("themeSelect");
        if (themeSelect) {
          const newTheme = themeSelect.value;
          localStorage.setItem("themePreference", newTheme);
          document.documentElement.setAttribute("data-theme", newTheme);
        }
        const languageSelect = document.getElementById("userLanguage");
        if (languageSelect) {
          const newLanguage = languageSelect.value;
          this.appState.userProfile.language = newLanguage;
          localStorage.setItem(
            "userProfile",
            JSON.stringify(this.appState.userProfile)
          );
          const { name = "" } = this.appState.userProfile;
          this.appState.chatHistory[0].content =
            this.generateSystemPrompt(
              this.appState.activeMode,
              name,
              newLanguage
            ) +
            "\n" +
            this.constants.detailLevels[this.appState.currentDetailLevel]
              .instruction;
        }
        uiElements.settingsModalDialog.style.display = "none";
      });
      uiElements.clearCacheButton?.addEventListener("click", () => {
        if (
          confirm(
            "Are you sure you want to clear the cache and local storage? This will reset your chat history, user profile, and settings."
          )
        ) {
          localStorage.removeItem("appState");
        }
      });
      document
        .getElementById("userProfileBtn")
        ?.addEventListener("click", () => {
          const profileModalDialog =
            document.getElementById("profileModalDialog");
          const userNameInput = document.getElementById("profileNameInput");
          if (profileModalDialog) {
            userNameInput.value = this.appState.userProfile?.name || "";
            profileModalDialog.style.display = "flex";
          }
        });
      document
        .getElementById("profileCancelButton")
        ?.addEventListener("click", () => {
          const profileModalDialog =
            document.getElementById("profileModalDialog");
          if (profileModalDialog) profileModalDialog.style.display = "none";
        });
      document
        .getElementById("userProfileForm")
        ?.addEventListener("submit", (e) => {
          e.preventDefault();
          const userNameInput = document.getElementById("profileNameInput");
          const name = userNameInput.value.trim();
          if (name) {
            this.appState.userProfile.name = name;
            localStorage.setItem(
              "userProfile",
              JSON.stringify(this.appState.userProfile)
            );
            const { language = "english" } = this.appState.userProfile;
            this.appState.chatHistory[0].content =
              this.generateSystemPrompt(
                this.appState.activeMode,
                name,
                language
              ) +
              "\n" +
              this.constants.detailLevels[this.appState.currentDetailLevel]
                .instruction;
          }
          const profileModalDialog =
            document.getElementById("profileModalDialog");
          if (profileModalDialog) profileModalDialog.style.display = "none";
        });
    },
    refreshUIStates() {
      this.updateModeUI();
      this.updateDetailUI();
      this.updateModelUI();
      this.updateResponseTemperature();
    },
  };

  // Expose removeAttachment globally
  deleteAttachment = function (index) {
    AuroraApp.appState.attachments.splice(index, 1);
    AuroraApp.updateAttachmentPreviews();
  };

  AuroraApp.initializeApp();
});
