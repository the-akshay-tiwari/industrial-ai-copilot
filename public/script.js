// Configure the markdown renderer used to display AI responses.
marked.setOptions({ breaks: true, sanitize: true });

// Cache the main DOM elements used by the chat interface.
const chatBox = document.getElementById("chat-box");
const userInput = document.getElementById("user-input");
const btnSend = document.getElementById("btn-send");
const fileInput = document.getElementById("file-upload");
const btnUpload = document.getElementById("btn-upload");
const welcomeScreen = document.getElementById("welcome-screen");

let sessionId = localStorage.getItem('ai_session_id');
if (!sessionId) {
    sessionId = 'session_' + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('ai_session_id', sessionId);
}

// Register the primary UI event handlers.
btnSend.addEventListener("click", sendMessage);
userInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});
btnUpload.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", handleFileUpload);

// Populate the input field from a suggestion chip.
function fillQuery(text) {
  userInput.value = text;
  userInput.focus();
}

// -------------------------
// CHAT LOGIC
// -------------------------
marked.setOptions({ breaks: true, sanitize: true });
let currentChatId = null;

async function sendMessage() {
  const userInput = document.getElementById("user-input");
  const text = userInput.value.trim();
  if (!text) return;

  // Determine whether this message starts a new conversation.
  const isNewChat = currentChatId === null;

  // Hide the welcome screen once the first message is sent.
  const welcomeScreen = document.getElementById("welcome-screen");
  if (welcomeScreen) welcomeScreen.style.display = "none";

  addMessage(text, "user-wrapper", "user-msg");
  userInput.value = "";

  // Show the typing indicator and disable input while the server responds.
  toggleInputs(true);
  const typingIndicator = showTypingIndicator(text);

  // Prepare the payload sent to the query endpoint.
  const payload = { query: text };
  if (currentChatId) payload.chatId = currentChatId;
  payload.sessionId = sessionId;

  try {
    const response = await fetch("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // Raise an error for non-OK responses so the failure path is handled consistently.
    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || response.status.toString());
    }

    const data = await response.json();

    // Add a new conversation entry to the sidebar immediately after the first successful response.
    if (isNewChat) {
      currentChatId = data.chatId;
      const listDiv = document.getElementById("chat-list");
      const btn = document.createElement("button");
      btn.id = `chat-${currentChatId}`;
      btn.className = "chat-history-item active";
      btn.innerText = `Session ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      btn.onclick = () => loadExistingChat(currentChatId, btn);

      // Use prepend so the new conversation appears at the top of the list.
      listDiv.prepend(btn);
    } else {
      currentChatId = data.chatId;
    }

    removeTypingIndicator(typingIndicator);
    addHTMLMessage(marked.parse(data.answer), "ai-wrapper", "ai-msg");
  } catch (error) {
    removeTypingIndicator(typingIndicator);

    // --- ERROR HANDLING ---
    if (
      error.message.includes("429") ||
      error.message.includes("Too Many Requests")
    ) {
      addHTMLMessage(
        "<strong>Rate Limit Exceeded:</strong><br>The AI is catching its breath! Please wait 60 seconds and try again. This is common during high-load demos.",
        "ai-wrapper",
        "ai-msg",
      );
      showToast("Slow Down", "Quota limit hit. Wait 1 min.", "error");
    } else {
      addHTMLMessage(
        "<strong>Error:</strong> Something went wrong with the brain.",
        "ai-wrapper",
        "ai-msg",
      );
      showToast("Error", "Server connection failed.", "error");
    }
  } finally {
    // Re-enable input controls after the request completes.
    toggleInputs(false);
    userInput.focus();
  }
}

// Create a new chat conversation and reset the visible thread.
function startNewChat() {
  // Preserve the current conversation in the history list if it has not been recorded yet.
  if (currentChatId) {
    const listDiv = document.getElementById("chat-list");
    // Check whether the sidebar already contains a button for this chat.
    if (!document.getElementById(`chat-${currentChatId}`)) {
      const btn = document.createElement("button");
      btn.id = `chat-${currentChatId}`;
      btn.className = "chat-history-item";

      // Use the current time as a readable session label.
      const time = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      btn.innerText = `Session ${time}`;

      btn.onclick = () => loadExistingChat(currentChatId, btn);
      listDiv.appendChild(btn);
    }
  }

  // Clear the current view and begin a new conversation.
  currentChatId = null;
  chatBox.innerHTML = "";
  if (welcomeScreen) welcomeScreen.style.display = "flex";

  showToast("New Chat", "Started a fresh workspace", "success");
}

// Load the chat history list from the server.
async function loadChatList() {
  try {
    const response = await fetch("/api/chats");
    const chats = await response.json();
    const listDiv = document.getElementById("chat-list");
    listDiv.innerHTML = "";

    chats.forEach((chatId) => {
      const btn = document.createElement("button");
      btn.className = "chat-history-item";
      // Convert the server timestamp into a readable time label.
      const time = new Date(parseInt(chatId.split("_")[1])).toLocaleTimeString(
        [],
        { hour: "2-digit", minute: "2-digit" },
      );
      btn.innerText = `Session ${time}`;
      btn.onclick = () => loadExistingChat(chatId, btn);
      listDiv.appendChild(btn);
    });
  } catch (e) {
    console.error("History load error");
  }
}

// Load an existing chat thread from the server and render it in the UI.
async function loadExistingChat(chatId, btnElement) {
  currentChatId = chatId;

  // Update the active state in the conversation list.
  document
    .querySelectorAll(".chat-history-item")
    .forEach((el) => el.classList.remove("active"));
  if (btnElement) btnElement.classList.add("active");

  const chatBox = document.getElementById("chat-box");
  const welcomeScreen = document.getElementById("welcome-screen");

  // Clear the existing view and show a loading placeholder while the history is fetched.
  chatBox.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">Loading session data...</div>`;
  if (welcomeScreen) welcomeScreen.style.display = "none";

  try {
    // Fetch the message history for the selected conversation.
    const response = await fetch(`/api/chats/${sessionId}`);
    const history = await response.json();

    // Clear the placeholder and render the restored messages.
    chatBox.innerHTML = "";

    if (history.length === 0) {
      addHTMLMessage(
        `<strong>System:</strong> No previous messages found.`,
        "ai-wrapper",
        "ai-msg",
      );
    } else {
      // Render each message in order to restore the conversation view.
      history.forEach((msg) => {
        if (msg.role === "user") {
          addMessage(msg.content, "user-wrapper", "user-msg");
        } else {
          addHTMLMessage(marked.parse(msg.content), "ai-wrapper", "ai-msg");
        }
      });
    }

    showToast("Loaded", "Previous session restored", "success");

    // Scroll to bottom
    setTimeout(() => {
      chatBox.scrollTop = chatBox.scrollHeight;
    }, 50);
  } catch (error) {
    chatBox.innerHTML = "";
    showToast("Error", "Could not load chat history.", "error");
  }
}

// Load the chat list as soon as the page is ready.
loadChatList();

// -------------------------
// FILE UPLOAD LOGIC
// -------------------------
async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  toggleInputs(true);
  const toastId = showToast(
    "Uploading...",
    `AI is analyzing ${file.name}`,
    "loading",
    0,
  ); // 0 means don't auto-close
  btnUpload.innerHTML = `<span class="spinner" style="display:inline-block; width:14px; height:14px; border:2px solid currentColor; border-top-color:transparent; border-radius:50%; animation: spin 1s linear infinite;"></span> Processing...`;

  const formData = new FormData();
  formData.append("document", file);

  try {
    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });
    const data = await response.json();

    removeToast(toastId);

    if (data.success) {
      showToast(
        "Success!",
        `'${file.name}' ingested into Knowledge Graph.`,
        "success",
      );

      if (welcomeScreen && chatBox.contains(welcomeScreen))
        welcomeScreen.style.display = "none";
      addHTMLMessage(
        `<strong>⚙️ Knowledge Base Updated:</strong><br>${data.message}`,
        "ai-wrapper",
        "ai-msg",
      );
    } else {
      throw new Error("Upload failed");
    }
  } catch (error) {
    removeToast(toastId);
    showToast("Upload Failed", "Could not process the document.", "error");
  } finally {
    toggleInputs(false);
    fileInput.value = "";
    btnUpload.innerHTML = `<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg> Upload PDF Manual`;
  }
}

// -------------------------
// UI HELPERS
// -------------------------
function toggleInputs(disabled) {
  userInput.disabled = disabled;
  btnSend.disabled = disabled;
  btnUpload.disabled = disabled;
}

// Display a progressive typing indicator while the backend is generating a response.
function showTypingIndicator(userQuery) {
  const chatBox = document.getElementById("chat-box");
  const loaderWrapper = document.createElement("div");
  loaderWrapper.className = "message-wrapper ai-wrapper typing-container";

  // Truncate the user query for display inside the loader.
  const shortQuery =
    userQuery.length > 25 ? userQuery.substring(0, 25) + "..." : userQuery;

  // Sequence of status messages shown during the wait period.
  const steps = [
    `Analyzing parameters for: "${shortQuery}"`,
    "Scanning Qdrant Vector Database...",
    "Traversing Neo4j Knowledge Graph...",
    "Synthesizing multimodal insights...",
  ];

  loaderWrapper.innerHTML = `
        <div class="message ai-msg" style="background: transparent; border: 1px dashed var(--border-heavy); box-shadow: none;">
            <div class="tech-loader">
                <span class="gear-icon">⚙️</span>
                <span id="loader-text" style="transition: opacity 0.4s ease-in-out; opacity: 1;">${steps[0]}</span>
            </div>
        </div>
    `;
  chatBox.appendChild(loaderWrapper);
  chatBox.scrollTop = chatBox.scrollHeight;

  let stepIndex = 0;
  // Advance the loading message every 2.5 seconds for a smoother experience.
  const intervalId = setInterval(() => {
    const textElement = document.getElementById("loader-text");
    if (textElement) {
      // Fade the current message out before updating it.
      textElement.style.opacity = "0";

      // Change the message after the fade-out completes and fade it back in.
      setTimeout(() => {
        stepIndex = (stepIndex + 1) % steps.length;
        textElement.innerText = steps[stepIndex];
        textElement.style.opacity = "1";
      }, 400);
    }
  }, 2500);

  loaderWrapper.dataset.intervalId = intervalId;
  return loaderWrapper;
}

function removeTypingIndicator(indicatorElement) {
  if (indicatorElement) {
    // Clear the interval so the loader does not continue after the response arrives.
    clearInterval(indicatorElement.dataset.intervalId);
    indicatorElement.remove();
  }
}

function addMessage(text, wrapperClass, msgClass) {
  const wrapper = document.createElement("div");
  wrapper.className = `message-wrapper ${wrapperClass}`;
  wrapper.innerHTML = `<div class="message ${msgClass}">${text}</div>`;
  chatBox.appendChild(wrapper);
  scrollToBottom();
}

function addHTMLMessage(htmlContent, wrapperClass, msgClass) {
  const wrapper = document.createElement("div");
  wrapper.className = `message-wrapper ${wrapperClass}`;
  wrapper.innerHTML = `<div class="message ${msgClass}">${htmlContent}</div>`;
  chatBox.appendChild(wrapper);
  scrollToBottom();
}

function scrollToBottom() {
  setTimeout(() => {
    chatBox.scrollTop = chatBox.scrollHeight;
  }, 50);
}

// --- TOAST SYSTEM ---
let toastCount = 0;
function showToast(title, message, type = "success", duration = 4000) {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  const id = `toast-${toastCount++}`;
  toast.id = id;
  toast.className = `toast ${type}`;

  let icon = "ℹ️";
  if (type === "success") icon = "✅";
  if (type === "error") icon = "❌";
  if (type === "loading") icon = "⏳";

  toast.innerHTML = `
        <div style="font-size: 1.2rem;">${icon}</div>
        <div>
            <div class="toast-title">${title}</div>
            <div class="toast-msg">${message}</div>
        </div>
    `;

  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(() => removeToast(id), duration);
  }
  return id;
}

function removeToast(id) {
  const toast = document.getElementById(id);
  if (toast) {
    toast.style.animation = "fadeOut 0.3s ease forwards";
    setTimeout(() => toast.remove(), 300);
  }
}
