document.addEventListener('DOMContentLoaded', () => {
    // --- Dependency Checker
    (function validateDependencies() {
        ['marked', 'hljs', 'DOMPurify'].forEach((dep) => {
            if (typeof window[dep] === 'undefined') {
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
        langPrefix: 'hljs language-'
    });

    // --- AuroraApp Object
    const AuroraApp = {
        // --- Configuration & Constants
        configuration: {
            apiKey:
                localStorage.getItem('apiKey') ||
                (window.configuration && window.configuration.apiKey) ||
                'YOUR_API_KEY_HERE'
        },
        constants: {
            detailLevels: {
                concise: {
                    instruction:
                        'Present a succinct response that emphasizes the core points with clarity and brevity, avoiding extraneous details.',
                    tokens: 8000
                },
                balanced: {
                    instruction:
                        'Craft a well-rounded response that covers essential details and context in clear, direct language without overcomplicating the message.',
                    tokens: 8000
                },
                context: {
                    instruction:
                        'Provide an in-depth response enriched with extensive background information, clarifications, illustrative examples, and supported by relevant sources for validation.',
                    tokens: 8000
                }
            },
            apiUrl: 'https://api.deepseek.com/v1/chat/completions',
            animationSettings: {
                buttonPress: [
                    { transform: 'scale(1)' },
                    { transform: 'scale(0.96)' },
                    { transform: 'scale(1)' }
                ],
                duration: 300
            }
        },
        appState: {
            activeMode: 'analyst',
            responseTemperature: 0.6,
            pendingMessages: new Map(),
            chatHistory: [],
            currentDetailLevel: 'balanced',
            activeModel: 'deepseek-chat',
            isLoading: false,
            abortController: null,
            attachments: [],
            lastMessageTimestamp: 0,
            userProfile: {},
            uiElements: {}
        },

        // --- Utility Functions
        utils: {
            debounce(func, delay) {
                let timer;
                return (...args) => {
                    clearTimeout(timer);
                    timer = setTimeout(() => func.apply(this, args), delay);
                };
            },
            autoExpand(field) {
                const MIN_HEIGHT = 52;
                field.style.height = 'auto';
                const computed = window.getComputedStyle(field);
                const maxH = parseFloat(computed.maxHeight) || 9999;
                const naturalH = Math.max(field.scrollHeight, MIN_HEIGHT);
                field.style.height = `${Math.min(naturalH, maxH)}px`;
                field.style.overflowY = naturalH >= maxH ? 'auto' : 'hidden';
            },
            sanitizeAndParse(content, inline = false) {
                const sanitized = DOMPurify.sanitize(content);
                return inline ? marked.parseInline(sanitized) : marked.parse(sanitized);
            },
            getRelativeTime(date) {
                const intervals = {
                    year: 525600,
                    month: 43800,
                    week: 10080,
                    day: 1440,
                    hour: 60,
                    minute: 1
                };
                const diff = Math.floor((Date.now() - date.getTime()) / 60000);
                for (const [unit, unitVal] of Object.entries(intervals)) {
                    const interval = Math.floor(diff / unitVal);
                    if (interval >= 1) {
                        return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
                    }
                }
                return 'Just now';
            },
            highlightCodeBlocks(element) {
                element.querySelectorAll('pre code').forEach((block) => {
                    hljs.highlightElement(block);
                });
            },
            addCopyButtons(element) {
                element.querySelectorAll('pre').forEach((pre) => {
                    if (pre.querySelector('.copy-button')) return;
                    const copyButton = document.createElement('button');
                    copyButton.className = 'copy-button';
                    copyButton.innerHTML = '<i class="fas fa-copy"></i>';
                    copyButton.addEventListener('click', (event) => {
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
                                console.error('Failed to copy text: ', err);
                            });
                    });
                    pre.appendChild(copyButton);
                });
            },
            logError(message) {
                console.error(message);
            },
            logWarn(message) {
                console.warn(message);
            }
        },

        // --- State Management Functions
        validateApiKey() {
            if (this.configuration.apiKey === 'SK-DEMO') {
                this.utils.logWarn(
                    'Warning: Please set a valid API key via the settings modal dialog!'
                );
            }
        },
        loadAppState() {
            try {
                const stored = localStorage.getItem('appState');
                const saved = stored ? JSON.parse(stored) : {};
                Object.assign(this.appState, saved);
            } catch (err) {
                this.utils.logWarn('Failed to parse saved appState: ' + err);
            }
        },
        saveAppState() {
            const dataToSave = {
                chatHistory: this.appState.chatHistory,
                activeMode: this.appState.activeMode,
                currentDetailLevel: this.appState.currentDetailLevel,
                activeModel: this.appState.activeModel,
                responseTemperature: this.appState.responseTemperature,
                userProfile: this.appState.userProfile
            };
            localStorage.setItem('appState', JSON.stringify(dataToSave));
        },
        loadUserProfile() {
            try {
                const storedProfile = localStorage.getItem('userProfile');
                this.appState.userProfile = storedProfile
                    ? JSON.parse(storedProfile)
                    : { language: 'english' };
                if (!this.appState.userProfile.language) {
                    this.appState.userProfile.language = 'english';
                }
            } catch (err) {
                this.utils.logWarn('Failed to parse user profile: ' + err);
                this.appState.userProfile = { language: 'english' };
            }
        },
        loadThemePreference() {
            const savedTheme = localStorage.getItem('themePreference');
            document.documentElement.setAttribute(
                'data-theme',
                savedTheme === 'light' ? 'light' : 'dark'
            );
        },
        initializeChatHistory() {
            if (!this.appState.chatHistory.length) {
                const { name = '', language = 'english' } = this.appState.userProfile;
                this.appState.chatHistory.push({
                    role: 'system',
                    content:
                        this.generateSystemPrompt(this.appState.activeMode, name, language) +
                        '\n' +
                        this.constants.detailLevels.balanced.instruction
                });
            }
        },
        generateSystemPrompt(mode, profileNameInput = '', language = 'english') {
            const namePart = profileNameInput ? `The user's name is ${profileNameInput}.  ` : '';
            const languageMap = {
                english: "The user's primary language is English.",
                german: 'Die Muttersprache des Nutzers ist deutsch.'
            };
            const languageInstruction = languageMap[language] || languageMap.english;
            const prompts = {
                coding: `You are Aurora, an advanced AI assistant specializing in coding. You provide expert guidance on creating, modifying, optimizing, and managing code files and projects. Always perform a detailed analysis of provided code and maintain a clear, chronological record of all changes. When answering, structure your output with clear headings, subheadings, and bullet points where appropriate. Present code within well-formatted code blocks, include concise inline comments, and explain your thought process in plain language. Your responses should be both precise and accessible to intermediate web developers and beginner programmers. ${namePart}${languageInstruction}`,
                creator: `You are Aurora, an advanced AI assistant specializing in art, digital media creation and corporate design. You provide insightful, creative guidance from conceptualization to production, balancing innovation with practical execution. Structure your responses with clear sections—begin with an overview, then break down your creative strategy, techniques, and any required steps. Use descriptive language, include visual references or design suggestions as needed, and format your output using bullet points, numbered lists, and headers for clarity. Ensure that your output is both inspirational and actionable. ${namePart}${languageInstruction}`,
                analyst: `You are Aurora, an advanced AI assistant specializing in analysis and advice on science, finance, and legal topics. Provide comprehensive, evidence-based insights supported by various credible sources. Structure your output with a clear introduction, detailed analysis sections, and a concise conclusion. Use tables, subheadings and bullet points to organize information, and include citations where applicable. Your analysis should be logically organized, transparent, and easily navigable, clearly articulated and supported by evidence. ${namePart}${languageInstruction}`
            };
            return prompts[mode] || prompts.analyst;
        },

        // --- DOM Caching & UI Element Functions
        cacheDomElements() {
            const ui = this.appState.uiElements;
            ui.modeToggleButtons = document.querySelectorAll('.mode-toggle-button');
            ui.modeSelectDropdown = document.getElementById('modeSelectDropdown');
            ui.chatWindow = document.getElementById('chatWindow');
            ui.chatPlaceholderElement = document.getElementById('chatPlaceholderElement');
            ui.messageInputField = document.getElementById('messageInputField');
            ui.sendButton = document.getElementById('sendButton');
            ui.confirmationModal = document.getElementById('confirmationModal');
            ui.confirmModalButton = document.getElementById('confirmModalButton');
            ui.cancelModalButton = document.getElementById('cancelModalButton');
            ui.uploadButton = document.getElementById('uploadButton');
            ui.fileInputElement = document.getElementById('fileInputElement');
            ui.detailLevelButtons = document.querySelectorAll('.detail-level-button');
            ui.modelSelectionButtons = document.querySelectorAll('.model-selection-button');
            ui.modelSelectDropdown = document.getElementById('modelSelectDropdown');
            ui.settingsModalDialog = document.getElementById('settingsModalDialog');
            ui.settingsFormElement = document.getElementById('settingsFormElement');
            ui.cancelSettingsButton = document.getElementById('cancelSettingsButton');
            ui.apiKeyInputField = document.getElementById('apiKeyInputField');
            ui.clearCacheButton = document.getElementById('clearCacheButton');
            ui.userSettingsButton = document.getElementById('userSettingsButton');
        },
        validateCriticalElements() {
            const ui = this.appState.uiElements;
            if (!ui.chatWindow) {
                console.error("Error: 'chatWindow' element not found in DOM.");
                return;
            }
            if (!ui.messageInputField) {
                console.error("Error: 'messageInputField' element not found in DOM.");
                return;
            }
            if (!ui.sendButton) {
                console.error("Error: 'sendButton' element not found in DOM.");
                return;
            }
            if (!ui.chatPlaceholderElement) {
                console.warn(
                    "Warning: 'chatPlaceholderElement' element not found in DOM. Some UI elements may not display correctly."
                );
            }
        },

        // --- Message Rendering & Chat History
        appendMessage(content, type, options = {}) {
            const {
                insertAfter = null,
                messageId = null,
                settings = null,
                skipTyping = false,
                processingTime = null,
                onComplete = null
            } = options;
            const frag = new DocumentFragment();
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${type}-message`;
            if (messageId && type === 'user') messageDiv.dataset.messageId = messageId;

            const timestamp = new Date();
            const timestampISO = timestamp.toISOString();
            const timeAgo = this.utils.getRelativeTime(timestamp);
            let headerHTML = '';

            if (type === 'user') {
                headerHTML = `<div class="message-header">
                    <span class="message-username">${this.appState.userProfile?.name
                        ? this.appState.userProfile.name + ' (You)'
                        : 'You'
                    }</span>
                    <div class="row">
                    <span class="message-timestamp" data-timestamp="${timestampISO}">${timeAgo}</span>
                    </div>
                </div>`;
            } else if (['ai', 'assistant', 'ai-cot'].includes(type)) {
                const modeLabel = settings?.mode || this.appState.activeMode;
                const estimatedTokens = this.estimateTokenCount(content);
                const processingTimeHTML =
                    type === 'ai' && processingTime
                        ? `<span class="message-request-time">${processingTime}&nbsp;s</span>`
                        : '';
                const tokenEstimateHTML = `<span class="message-token-estimate"><span style="color:var(--color-text-secondary);">♦&nbsp;</span>${estimatedTokens}&nbsp;Tokens</span>`;
                const username =
                    type === 'ai-cot' ? 'Reasoning' : `<div>Aurora → ${modeLabel}</div>`;
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
            const contentElement = messageDiv.querySelector('.message-content');

            if (['user', 'error'].includes(type)) {
                const parsedContent =
                    type === 'error'
                        ? DOMPurify.sanitize(content)
                        : this.utils.sanitizeAndParse(content);
                contentElement.innerHTML = parsedContent;
                this.utils.highlightCodeBlocks(contentElement);
                this.utils.addCopyButtons(contentElement);
            } else if (['ai', 'ai-cot'].includes(type)) {
                messageDiv.classList.add('typing');
                if (skipTyping) {
                    contentElement.innerHTML = this.utils.sanitizeAndParse(content);
                    messageDiv.classList.remove('typing');
                    this.utils.highlightCodeBlocks(contentElement);
                    this.utils.addCopyButtons(contentElement);
                } else {
                    this.animateTyping(contentElement, content, () => {
                        contentElement.innerHTML = this.utils.sanitizeAndParse(content);
                        messageDiv.classList.remove('typing');
                        this.utils.highlightCodeBlocks(contentElement);
                        this.utils.addCopyButtons(contentElement);
                        if (typeof onComplete === 'function') onComplete();
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
            this.updateLastMessageOpacity();
        },
        updateTimestamps() {
            document.querySelectorAll('.message-timestamp').forEach((el) => {
                const timestampString = el.dataset.timestamp;
                if (!timestampString) return;
                el.textContent = this.utils.getRelativeTime(new Date(timestampString));
            });
        },
        removeMessage(messageElement) {
            messageElement.remove();
            this.saveAppState();
            this.updatePlaceholderVisibility();
            this.updateLastMessageOpacity();
        },
        renderChatHistory() {
            const ui = this.appState.uiElements;
            ui.chatWindow.innerHTML = '';
            if (!ui.chatPlaceholderElement) {
                console.error('chatPlaceholderElement element not found in DOM');
                return;
            }
            const hasMessages = this.appState.chatHistory.some((msg) =>
                ['user', 'assistant', 'error', 'assistant-cot'].includes(msg.role)
            );
            if (!hasMessages) {
                ui.chatWindow.appendChild(ui.chatPlaceholderElement);
                ui.chatPlaceholderElement.style.display = 'flex';
                return;
            } else {
                ui.chatPlaceholderElement.style.display = 'none';
            }
            this.appState.chatHistory.forEach((msg) => {
                if (msg.role === 'system') return;
                const opts = { skipTyping: true };
                if (msg.role === 'user') {
                    this.appendMessage(msg.content, 'user', opts);
                } else if (msg.role === 'assistant') {
                    opts.processingTime = msg.processingTime;
                    this.appendMessage(msg.content, 'ai', opts);
                } else if (msg.role === 'error') {
                    this.appendMessage(msg.content, 'error', opts);
                } else if (msg.role === 'assistant-cot') {
                    this.appendMessage(msg.content, 'ai-cot', opts);
                }
            });
            this.scrollToBottomIfNeeded(true);
            this.updateLastMessageOpacity();
        },
        updatePlaceholderVisibility() {
            const hasMessages =
                this.appState.uiElements.chatWindow.querySelector('.message') !== null;
            if (this.appState.uiElements.chatPlaceholderElement) {
                this.appState.uiElements.chatPlaceholderElement.style.display =
                    hasMessages ? 'none' : 'flex';
            } else {
                console.warn('chatPlaceholderElement element is missing in the DOM');
            }
        },
        estimateTokenCount(text) {
            return Math.ceil(text.length / 3);
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
        isNearBottom(container, threshold = 240) {
            return (
                container.scrollHeight - container.scrollTop - container.clientHeight <=
                threshold
            );
        },
        animateTyping(element, rawText, onComplete, charsPerTick = 1, delay = 0) {
            let index = 0;
            let tempBuffer = '';
            const length = rawText.length;
            const typeChunk = () => {
                if (index < length) {
                    tempBuffer += rawText.slice(index, index + charsPerTick);
                    element.innerHTML = this.utils.sanitizeAndParse(tempBuffer, true);
                    this.scrollToBottomIfNeeded();
                    index += charsPerTick;
                    setTimeout(typeChunk, delay);
                } else {
                    element.innerHTML = this.utils.sanitizeAndParse(rawText);
                    this.scrollToBottomIfNeeded();
                    requestAnimationFrame(() => {
                        this.utils.highlightCodeBlocks(element);
                        this.utils.addCopyButtons(element);
                        if (typeof onComplete === 'function') onComplete();
                    });
                }
            };
            typeChunk();
        },

        // --- Attachment Handling
        updateAttachmentPreviews() {
            const container = document.getElementById('attachmentPreviews');
            if (!container) return;
            container.innerHTML = '';
            this.appState.attachments.forEach((attachment, idx) => {
                const preview = document.createElement('div');
                preview.className = 'attachment-preview';
                const nameSpan = document.createElement('span');
                nameSpan.textContent = attachment.name;
                preview.appendChild(nameSpan);
                const deleteButton = document.createElement('button');
                deleteButton.className = 'delete-attachment-button';
                deleteButton.innerHTML = '<i class="fas fa-times"></i>';
                deleteButton.addEventListener('click', (event) => {
                    event.stopPropagation();
                    this.deleteAttachment(idx);
                });
                preview.appendChild(deleteButton);
                container.appendChild(preview);
            });
        },
        async readFileContent(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    if (file.type.startsWith('image/')) {
                        resolve(`![Uploaded Image](${e.target.result})`);
                    } else {
                        resolve(`**Uploaded File (${file.name}):**\n\n${e.target.result}\n`);
                    }
                };
                reader.onerror = reject;
                file.type.startsWith('image/')
                    ? reader.readAsDataURL(file)
                    : reader.readAsText(file);
            });
        },
        deleteAttachment(index) {
            this.appState.attachments.splice(index, 1);
            this.updateAttachmentPreviews();
        },

        // --- API & Messaging
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
                completeMessage += '\n\n[Attachments]';
                this.appState.attachments.forEach((att) => {
                    completeMessage += `\nFile: ${att.name}\n${att.content}\n`;
                });
            }
            const messagePayload = {
                text: completeMessage,
                attachments: this.appState.attachments.map((att) => ({
                    name: att.name,
                    type: att.type,
                    content: att.content
                })),
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                settings: {
                    mode: activeMode,
                    currentDetailLevel: currentDetailLevel,
                    model: activeModel
                }
            };
            this.appState.chatHistory.push({
                role: 'user',
                content: completeMessage
            });
            this.appendMessage(completeMessage, 'user', {
                skipTyping: true,
                messageId: messagePayload.id,
                settings: messagePayload.settings
            });
            this.scrollToBottomIfNeeded(true);
            const userMessageElement =
                this.appState.uiElements.chatWindow.lastElementChild;
            this.appState.pendingMessages.set(messagePayload.id, {
                element: userMessageElement,
                startTime: Date.now(),
                settings: messagePayload.settings
            });
            this.appState.uiElements.messageInputField.value = '';
            requestAnimationFrame(() =>
                this.utils.autoExpand(this.appState.uiElements.messageInputField)
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
                    top_p: 0.9,
                    stream: true
                };
                console.log('Sending payload:', payload);
                const response = await fetch(this.constants.apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${this.configuration.apiKey}`
                    },
                    body: JSON.stringify(payload)
                });
                if (!response.ok) {
                    let errorData;
                    try {
                        errorData = await response.json();
                    } catch (err) {
                        errorData = { error: { message: await response.text() } };
                    }
                    throw new Error(
                        `API error: ${response.status} - ${errorData.error?.message || 'Unknown error'
                        }`
                    );
                }
                // Process streaming response in real time
                await this.processStreamingResponse(response, messagePayload);
            } catch (error) {
                console.error('Error in sendMessage:', error);
                const errorContent = `Error: ${error.message}`;
                this.appState.chatHistory.push({
                    role: 'error',
                    content: errorContent
                });
                this.appendMessage(errorContent, 'error');
                this.appState.pendingMessages.delete(messagePayload.id);
            } finally {
                this.appState.isLoading = false;
                this.hideLoadingIndicator();
                this.saveAppState();
            }
        },
        async processStreamingResponse(response, messagePayload) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            const timestamp = new Date();
            const timestampISO = timestamp.toISOString();
            const timeAgo = this.utils.getRelativeTime(timestamp);
            const modeLabel = messagePayload.settings.mode || this.appState.activeMode;

            if (messagePayload.settings.model === 'deepseek-reasoner') {
                await this.processCoTResponse(reader, decoder, messagePayload, timestampISO, timeAgo, modeLabel);
            } else {
                await this.processStandardResponse(reader, decoder, messagePayload, timestampISO, timeAgo, modeLabel);
            }
        },
        async processCoTResponse(reader, decoder, messagePayload, timestampISO, timeAgo, modeLabel) {
            let done = false;
            let accumulatedCot = '';
            let accumulatedFinal = '';
            // Create and append the CoT message element
            const cotMessageDiv = document.createElement('div');
            cotMessageDiv.className = 'message ai-cot-message streaming typing';
            const cotHeaderHTML = `<div class="message-header">
                    <span class="message-username">Reasoning</span>
                    <div class="row">
                    <span class="message-timestamp" data-timestamp="${timestampISO}">${timeAgo}</span>
                    </div>
                </div>`;
            cotMessageDiv.innerHTML = `${cotHeaderHTML}<span class="message-content"></span>`;
            const cotContentElement = cotMessageDiv.querySelector('.message-content');
            this.appState.uiElements.chatWindow.appendChild(cotMessageDiv);

            // Prepare final answer element (appended upon first content)
            let aiMessageDiv = null;
            let aiContentElement = null;
            let aiAppended = false;

            while (!done) {
                const { value, done: doneReading } = await reader.read();
                done = doneReading;
                if (value) {
                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split('\n');
                    for (let line of lines) {
                        line = line.trim();
                        if (!line) continue;
                        if (line === 'data: [DONE]') {
                            done = true;
                            break;
                        }
                        if (line.startsWith('data: ')) {
                            const jsonStr = line.substring(6).trim();
                            try {
                                const parsed = JSON.parse(jsonStr);
                                const delta = parsed.choices[0].delta;
                                if (delta) {
                                    if (delta.reasoning_content) {
                                        accumulatedCot += delta.reasoning_content;
                                        cotContentElement.innerHTML = this.utils.sanitizeAndParse(accumulatedCot);
                                    }
                                    if (delta.content) {
                                        if (!aiAppended) {
                                            aiMessageDiv = document.createElement('div');
                                            aiMessageDiv.className = 'message ai-message streaming typing';
                                            const aiHeaderHTML = `<div class="message-header">
                                    <span class="message-username"><div>Aurora → ${modeLabel}</div></span>
                                    <div class="row">
                                        <span class="message-timestamp" data-timestamp="${timestampISO}">${timeAgo}</span>
                                    </div>
                                    </div>`;
                                            aiMessageDiv.innerHTML = `${aiHeaderHTML}<span class="message-content"></span>`;
                                            aiContentElement = aiMessageDiv.querySelector('.message-content');
                                            this.appState.uiElements.chatWindow.appendChild(aiMessageDiv);
                                            aiAppended = true;
                                        }
                                        accumulatedFinal += delta.content;
                                        aiContentElement.innerHTML = this.utils.sanitizeAndParse(accumulatedFinal);
                                    }
                                }
                            } catch (e) {
                                console.error('Error parsing streaming chunk', e);
                            }
                        }
                    }
                    this.scrollToBottomIfNeeded();
                }
            }
            // Finalize elements
            cotMessageDiv.classList.remove('typing', 'streaming');
            if (aiMessageDiv) {
                aiMessageDiv.classList.remove('typing', 'streaming');
                this.utils.highlightCodeBlocks(aiContentElement);
                this.utils.addCopyButtons(aiContentElement);
            }
            const pendingObj = this.appState.pendingMessages.get(messagePayload.id);
            const processingTime = pendingObj
                ? ((Date.now() - pendingObj.startTime) / 1000).toFixed(2)
                : 'N/A';
            this.appState.chatHistory.push({
                role: 'assistant-cot',
                content: accumulatedCot
            });
            this.appState.chatHistory.push({
                role: 'assistant',
                content: accumulatedFinal,
                processingTime: processingTime
            });
            this.updateLastMessageOpacity();
        },
        async processStandardResponse(reader, decoder, messagePayload, timestampISO, timeAgo, modeLabel) {
            let done = false;
            let accumulatedFinal = '';
            const aiMessageDiv = document.createElement('div');
            aiMessageDiv.className = 'message ai-message streaming typing';
            const aiHeaderHTML = `<div class="message-header">
            <span class="message-username"><div>Aurora → ${modeLabel}</div></span>
            <div class="row">
                <span class="message-timestamp" data-timestamp="${timestampISO}">${timeAgo}</span>
            </div>
            </div>`;
            aiMessageDiv.innerHTML = `${aiHeaderHTML}<span class="message-content"></span>`;
            const aiContentElement = aiMessageDiv.querySelector('.message-content');
            this.appState.uiElements.chatWindow.appendChild(aiMessageDiv);

            while (!done) {
                const { value, done: doneReading } = await reader.read();
                done = doneReading;
                if (value) {
                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split('\n');
                    for (let line of lines) {
                        line = line.trim();
                        if (!line) continue;
                        if (line === 'data: [DONE]') {
                            done = true;
                            break;
                        }
                        if (line.startsWith('data: ')) {
                            const jsonStr = line.substring(6).trim();
                            try {
                                const parsed = JSON.parse(jsonStr);
                                const delta = parsed.choices[0].delta;
                                if (delta && delta.content) {
                                    accumulatedFinal += delta.content;
                                    aiContentElement.innerHTML = this.utils.sanitizeAndParse(accumulatedFinal);
                                }
                            } catch (e) {
                                console.error('Error parsing streaming chunk', e);
                            }
                        }
                    }
                    this.scrollToBottomIfNeeded();
                }
            }
            aiMessageDiv.classList.remove('typing', 'streaming');
            this.utils.highlightCodeBlocks(aiContentElement);
            this.utils.addCopyButtons(aiContentElement);
            const pendingObj = this.appState.pendingMessages.get(messagePayload.id);
            const processingTime = pendingObj
                ? ((Date.now() - pendingObj.startTime) / 1000).toFixed(2)
                : 'N/A';
            this.appState.chatHistory.push({
                role: 'assistant',
                content: accumulatedFinal,
                processingTime: processingTime
            });
            this.updateLastMessageOpacity();
        },
        prepareMessagesForAPI() {
            const includeCot = this.appState.activeModel === 'deepseek-reasoner';
            const rolesToInclude = ['system', 'user', 'assistant'];
            if (includeCot) {
                rolesToInclude.push('assistant-cot');
            }
            const baseMessages = this.appState.chatHistory
                .filter((m) => rolesToInclude.includes(m.role))
                .map((m) => {
                    if (m.role === 'assistant-cot') {
                        return { ...m, role: 'assistant' };
                    }
                    return m;
                });
            const mergedMessages = [];
            for (const message of baseMessages) {
                const last = mergedMessages[mergedMessages.length - 1];
                if (last && last.role === message.role) {
                    last.content += "\n\n" + message.content;
                } else {
                    mergedMessages.push({ ...message });
                }
            }
            const systemMsg = mergedMessages.find((m) => m.role === 'system');
            let nonSystem = mergedMessages.filter((m) => m.role !== 'system');
            const firstUserIndex = nonSystem.findIndex((m) => m.role === 'user');
            nonSystem = firstUserIndex !== -1 ? nonSystem.slice(firstUserIndex) : [];
            const alternating = [];
            let expectedRole = 'user';
            for (const msg of nonSystem) {
                if (msg.role === expectedRole) {
                    alternating.push(msg);
                    expectedRole = expectedRole === 'user' ? 'assistant' : 'user';
                } else if (msg.role === 'user' && expectedRole === 'assistant') {
                    alternating[alternating.length - 1].content += "\n\n" + msg.content;
                }
            }
            const finalMessages = systemMsg ? [systemMsg, ...alternating] : alternating;
            return finalMessages;
        },

        // --- Modal & Misc UI Flow
        displayModal() {
            this.appState.uiElements.confirmationModal.style.display = 'flex';
        },
        hideModal() {
            this.appState.uiElements.confirmationModal.style.display = 'none';
        },
        confirmNewChat() {
            this.hideModal();
            localStorage.removeItem('appState');
            this.appState.chatHistory = [];
            this.appState.uiElements.chatWindow.innerHTML = '';
            this.appState.uiElements.chatWindow.appendChild(
                this.appState.uiElements.chatPlaceholderElement
            );
            this.updatePlaceholderVisibility();
            const { name = '', language = 'english' } = this.appState.userProfile;
            this.appState.chatHistory.push({
                role: 'system',
                content:
                    this.generateSystemPrompt('analyst', name, language) +
                    '\n' +
                    this.constants.detailLevels.balanced.instruction
            });
            this.appState.activeMode = 'analyst';
            this.appState.currentDetailLevel = 'balanced';
            this.appState.activeModel = 'deepseek-chat';
            this.appState.responseTemperature = 0.6;
            this.resetModeButtons();
            this.updateModeUI();
            this.updateDetailUI();
            this.updateModelUI();
            this.updateAttachmentPreviews();
            this.utils.autoExpand(this.appState.uiElements.messageInputField);
        },
        resetModeButtons() {
            if (!this.appState.uiElements.modeToggleButtons) {
                console.error('Error: modeToggleButtons not found in DOM.');
                return;
            }
            this.appState.uiElements.modeToggleButtons.forEach((btn) => {
                btn.classList.remove('active');
                btn.removeAttribute('aria-current');
            });
            const analystBtn = Array.from(this.appState.uiElements.modeToggleButtons).find(
                (btn) => btn.dataset.mode === 'analyst'
            );
            if (analystBtn) {
                analystBtn.classList.add('active');
                analystBtn.setAttribute('aria-current', 'true');
                this.animateElement(analystBtn);
            } else {
                console.warn('Warning: Analyst mode button not found in DOM.');
            }
        },
        updateModeUI() {
            this.appState.uiElements.modeToggleButtons.forEach((btn) => {
                btn.classList.toggle(
                    'active',
                    btn.dataset.mode === this.appState.activeMode
                );
                btn.toggleAttribute(
                    'aria-current',
                    btn.dataset.mode === this.appState.activeMode
                );
            });
            if (this.appState.uiElements.modeSelectDropdown) {
                this.appState.uiElements.modeSelectDropdown.value = this.appState.activeMode;
            }
        },
        updateDetailUI() {
            this.appState.uiElements.detailLevelButtons.forEach((btn) => {
                btn.classList.toggle(
                    'active',
                    btn.dataset.detail === this.appState.currentDetailLevel
                );
                btn.toggleAttribute(
                    'aria-current',
                    btn.dataset.detail === this.appState.currentDetailLevel
                );
            });
        },
        updateModelUI() {
            this.appState.uiElements.modelSelectionButtons.forEach((btn) => {
                btn.classList.toggle(
                    'active',
                    btn.dataset.model === this.appState.activeModel
                );
                btn.toggleAttribute(
                    'aria-current',
                    btn.dataset.model === this.appState.activeModel
                );
            });
            if (this.appState.uiElements.modelSelectDropdown) {
                this.appState.uiElements.modelSelectDropdown.value = this.appState.activeModel;
            }
        },
        animateElement(element) {
            element.animate(this.constants.animationSettings.buttonPress, {
                duration: this.constants.animationSettings.duration,
                easing: 'ease-out'
            });
        },
        updateResponseTemperature() {
            switch (this.appState.activeMode) {
                case 'creator':
                    this.appState.responseTemperature = 1.2;
                    break;
                case 'coding':
                    this.appState.responseTemperature = 0.0;
                    break;
                default:
                    this.appState.responseTemperature = 0.6;
            }
        },
        showLoadingIndicator() {
            const loading = document.createElement('div');
            loading.className = 'loading';
            loading.innerHTML = `<span>Aurora is thinking</span>
                    <div class="loading-dots">
                    <div class="loading-dot"></div>
                    <div class="loading-dot"></div>
                    <div class="loading-dot"></div>
                    </div>`;
            const container = this.appState.uiElements.chatWindow;
            container.appendChild(loading);
            if (
                container.scrollHeight - container.scrollTop - container.clientHeight <= 100
            ) {
                container.scrollTop = container.scrollHeight;
            }
        },
        hideLoadingIndicator() {
            const loading = document.querySelector('.loading');
            if (loading) loading.remove();
        },

        // --- Event Handlers & UI Updates
        onModeChange(element) {
            const newMode =
                element.tagName === 'SELECT' ? element.value : element.dataset.mode;
            this.appState.activeMode = newMode;
            this.updateModeUI();
            const { name = '', language = 'english' } = this.appState.userProfile;
            this.appState.chatHistory[0] = {
                role: 'system',
                content:
                    this.generateSystemPrompt(newMode, name, language) +
                    '\n' +
                    this.constants.detailLevels[this.appState.currentDetailLevel].instruction
            };
            this.updateResponseTemperature();
            this.animateElement(element);
            this.saveAppState();
        },
        onModelChange(element) {
            const newModel =
                element.tagName === 'SELECT' ? element.value : element.dataset.model;
            this.appState.activeModel = newModel;
            this.updateModelUI();
            this.animateElement(element);
            this.saveAppState();
        },
        onDetailLevelChange(event) {
            const button = event.currentTarget;
            this.appState.uiElements.detailLevelButtons.forEach((btn) => {
                console.log('Detail level button clicked:', button.dataset.detail);
                btn.classList.remove('active');
                btn.removeAttribute('aria-current');
            });
            button.classList.add('active');
            button.setAttribute('aria-current', 'true');
            this.appState.currentDetailLevel = button.dataset.detail;
            const { name = '', language = 'english' } = this.appState.userProfile;
            this.appState.chatHistory[0].content =
                this.generateSystemPrompt(this.appState.activeMode, name, language) +
                '\n' +
                this.constants.detailLevels[this.appState.currentDetailLevel].instruction;
            this.animateElement(button);
            this.saveAppState();
        },
        async handleFileUpload(e) {
            const files = e.target.files;
            if (!files?.length) return;
            const allowedTypes = [
                'text/plain',
                'image/jpeg',
                'image/png',
                'text/markdown',
                'text/html',
                'application/javascript',
                'application/x-javascript',
                'text/css',
                'application/x-php',
                'text/x-python'
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
                        content
                    });
                }
                this.updateAttachmentPreviews();
                this.updatePlaceholderVisibility();
            } catch (error) {
                const errorContent = `File upload failed: ${error.message}`;
                this.appState.chatHistory.push({
                    role: 'error',
                    content: errorContent
                });
                this.appendMessage(errorContent, 'error');
                this.updatePlaceholderVisibility();
            }
            e.target.value = '';
        },
        handleInputKeyPress(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        },
        onWindowClick(e) {
            if (e.target === this.appState.uiElements.confirmationModal)
                this.hideModal();
        },
        onEscapeKey(e) {
            if (e.key === 'Escape') {
                if (this.appState.uiElements.confirmationModal.style.display === 'flex')
                    this.hideModal();
                const profileModalDialog = document.getElementById('profileModalDialog');
                if (profileModalDialog && profileModalDialog.style.display === 'flex') {
                    profileModalDialog.style.display = 'none';
                }
            }
        },
        attachEventListeners() {
            const ui = this.appState.uiElements;
            ui.uploadButton?.addEventListener('click', () =>
                ui.fileInputElement.click()
            );
            ui.fileInputElement?.addEventListener(
                'change',
                this.handleFileUpload.bind(this)
            );
            ui.modeToggleButtons.forEach((btn) =>
                btn.addEventListener('click', () => this.onModeChange(btn))
            );
            ui.detailLevelButtons.forEach((btn) =>
                btn.addEventListener('click', (event) => this.onDetailLevelChange(event))
            );
            ui.modelSelectionButtons.forEach((btn) =>
                btn.addEventListener('click', (event) => {
                    console.log('Model changed to:', event.target.dataset.model);
                    this.onModelChange(event.target);
                })
            );
            ui.sendButton?.addEventListener('click', this.sendMessage.bind(this));
            ui.messageInputField?.addEventListener(
                'input',
                this.utils.debounce(() => this.utils.autoExpand(ui.messageInputField), 300)
            );
            ui.messageInputField?.addEventListener(
                'keydown',
                this.handleInputKeyPress.bind(this)
            );
            document
                .getElementById('newChatButton')
                ?.addEventListener('click', this.displayModal.bind(this));
            ui.confirmModalButton?.addEventListener(
                'click',
                this.confirmNewChat.bind(this)
            );
            ui.cancelModalButton?.addEventListener(
                'click',
                this.hideModal.bind(this)
            );
            window.addEventListener('click', this.onWindowClick.bind(this));
            document.addEventListener('keydown', this.onEscapeKey.bind(this));
            if (ui.modeSelectDropdown) {
                ui.modeSelectDropdown.addEventListener('change', (e) =>
                    this.onModeChange(e.currentTarget)
                );
            }
            if (ui.modelSelectDropdown) {
                ui.modelSelectDropdown.addEventListener('change', (e) =>
                    this.onModelChange(e.currentTarget)
                );
            }
            // --- Settings & Profile Events
            ui.userSettingsButton?.addEventListener('click', () => {
                ui.apiKeyInputField.value = this.configuration.apiKey;
                const themeSelect = document.getElementById('themeSelect');
                if (themeSelect) {
                    themeSelect.value = localStorage.getItem('themePreference') || 'light';
                }
                const languageSelect = document.getElementById('userLanguage');
                if (languageSelect) {
                    languageSelect.value = this.appState.userProfile.language || 'english';
                }
                ui.settingsModalDialog.style.display = 'flex';
            });
            ui.cancelSettingsButton?.addEventListener('click', () => {
                ui.settingsModalDialog.style.display = 'none';
            });
            ui.settingsFormElement?.addEventListener('submit', (e) => {
                e.preventDefault();
                console.log('Saving API Key …');
                const newApiKey = ui.apiKeyInputField.value.trim();
                if (newApiKey) {
                    this.configuration.apiKey = newApiKey;
                    localStorage.setItem('apiKey', newApiKey);
                    console.info('API key updated successfully.');
                } else {
                    console.warn('API key cannot be empty. No changes made.');
                }
                const themeSelect = document.getElementById('themeSelect');
                if (themeSelect) {
                    const newTheme = themeSelect.value;
                    localStorage.setItem('themePreference', newTheme);
                    document.documentElement.setAttribute('data-theme', newTheme);
                }
                const languageSelect = document.getElementById('userLanguage');
                if (languageSelect) {
                    const newLanguage = languageSelect.value;
                    this.appState.userProfile.language = newLanguage;
                    localStorage.setItem(
                        'userProfile',
                        JSON.stringify(this.appState.userProfile)
                    );
                    const { name = '' } = this.appState.userProfile;
                    this.appState.chatHistory[0].content =
                        this.generateSystemPrompt(
                            this.appState.activeMode,
                            name,
                            newLanguage
                        ) +
                        '\n' +
                        this.constants.detailLevels[this.appState.currentDetailLevel].instruction;
                }
                ui.settingsModalDialog.style.display = 'none';
            });
            document
                .getElementById('clearCacheButton')
                ?.addEventListener('click', () => {
                    if (confirm('Are you sure...?')) {
                        localStorage.removeItem('appState');
                        localStorage.removeItem('userProfile');
                        localStorage.removeItem('apiKey');
                        this.appState = {
                            ...this.appState,
                            userProfile: { language: 'english' },
                            chatHistory: [],
                            activeMode: 'analyst',
                            currentDetailLevel: 'balanced'
                        };
                        this.refreshUIStates();
                        this.renderChatHistory();
                        console.info('Cache and local storage cleared successfully');
                    }
                });
            document
                .getElementById('userProfileBtn')
                ?.addEventListener('click', () => {
                    const profileModalDialog = document.getElementById('profileModalDialog');
                    const userNameInput = document.getElementById('profileNameInput');
                    if (profileModalDialog) {
                        userNameInput.value = this.appState.userProfile?.name || '';
                        profileModalDialog.style.display = 'flex';
                    }
                });
            document
                .getElementById('profileCancelButton')
                ?.addEventListener('click', () => {
                    const profileModalDialog = document.getElementById('profileModalDialog');
                    if (profileModalDialog) profileModalDialog.style.display = 'none';
                });
            document
                .getElementById('userProfileForm')
                ?.addEventListener('submit', (e) => {
                    e.preventDefault();
                    const userNameInput = document.getElementById('profileNameInput');
                    const name = userNameInput.value.trim();
                    if (name) {
                        this.appState.userProfile.name = name;
                        localStorage.setItem(
                            'userProfile',
                            JSON.stringify(this.appState.userProfile)
                        );
                        const { language = 'english' } = this.appState.userProfile;
                        this.appState.chatHistory[0].content =
                            this.generateSystemPrompt(this.appState.activeMode, name, language) +
                            '\n' +
                            this.constants.detailLevels[this.appState.currentDetailLevel].instruction;
                    }
                    const profileModalDialog = document.getElementById('profileModalDialog');
                    if (profileModalDialog) profileModalDialog.style.display = 'none';
                });
        },
        updateLastMessageOpacity() {
            const messageTypes = ['error', 'user', 'ai', 'ai-cot'];
            messageTypes.forEach(type => {
                // The messages have class names like "user-message", "ai-message", etc.
                const messages = this.appState.uiElements.chatWindow.querySelectorAll(`.message.${type}-message`);
                if (messages.length) {
                    // Set the opacity of the last element to 1
                    messages[messages.length - 1].style.opacity = '1';
                }
            });
        },
        refreshUIStates() {
            this.updateModeUI();
            this.updateDetailUI();
            this.updateModelUI();
            this.updateResponseTemperature();
        },

        // --- Initialization
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
        }
    };

    AuroraApp.initializeApp();
});
