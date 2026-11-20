"use strict";

class FloatingStudyAssistant {
  constructor() {
    this.elements = {
      launcher: document.querySelector("#assistant-launcher"),
      panel: document.querySelector("#assistant-panel"),
      close: document.querySelector("#assistant-close"),
      form: document.querySelector("#assistant-form"),
      input: document.querySelector("#assistant-input"),
      messages: document.querySelector("#assistant-messages"),
      prompts: document.querySelector("#assistant-prompts"),
      openAction: document.querySelector("#open-assistant-action"),
      openMobile: document.querySelector("#open-assistant-mobile")
    };
    if (!this.elements.launcher || !this.elements.panel) return;
    this.isSending = false;
    this.bindEvents();
  }

  bindEvents() {
    this.elements.launcher.addEventListener("click", () => this.setOpen(this.elements.panel.hidden));
    this.elements.close.addEventListener("click", () => this.setOpen(false));
    this.elements.form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.sendMessage();
    });
    this.elements.prompts.addEventListener("click", (event) => {
      const prompt = event.target.closest("[data-prompt]");
      if (!prompt || this.isSending) return;
      this.elements.input.value = prompt.dataset.prompt;
      this.sendMessage();
    });
    for (const button of [this.elements.openAction, this.elements.openMobile]) {
      button?.addEventListener("click", () => {
        this.setOpen(true);
        this.elements.input.focus();
      });
    }
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !this.elements.panel.hidden) this.setOpen(false);
    });
  }

  setOpen(isOpen) {
    this.elements.panel.hidden = !isOpen;
    this.elements.launcher.setAttribute("aria-expanded", String(isOpen));
    this.elements.launcher.setAttribute("aria-label", isOpen ? "Close AI study assistant" : "Open AI study assistant");
    if (isOpen) this.elements.input.focus();
    else this.elements.launcher.focus();
  }

  addMessage(message, type) {
    const article = document.createElement("article");
    article.className = `chat-message chat-${type}`;
    if (type === "ai") {
      const avatar = document.createElement("span");
      avatar.className = "chat-avatar";
      avatar.setAttribute("aria-hidden", "true");
      avatar.textContent = "✦";
      article.append(avatar);
    }
    const text = document.createElement("p");
    text.textContent = message;
    article.append(text);
    this.elements.messages.append(article);
    this.elements.messages.scrollTop = this.elements.messages.scrollHeight;
    return article;
  }

  async sendMessage() {
    const question = this.elements.input.value.trim();
    if (!question || this.isSending) return;
    this.isSending = true;
    this.elements.input.value = "";
    this.elements.input.disabled = true;
    this.elements.form.querySelector("button").disabled = true;
    this.elements.prompts.hidden = true;
    this.addMessage(question, "user");
    const typing = this.addMessage("Thinking through that with you…", "ai");
    typing.classList.add("chat-typing");
    try {
      const topic = document.querySelector("#topic-input")?.value.trim()
        || document.querySelector("#cbt-topic")?.textContent.trim()
        || "";
      const material = document.querySelector("#material-input")?.value.trim() || "";
      const result = await window.requestStudyTask("tutor", { question, topic, material });
      typing.remove();
      this.addMessage(result.answer, "ai");
    } catch (error) {
      typing.remove();
      this.addMessage(`I couldn't reach the study service: ${error.message}`, "error");
    } finally {
      this.isSending = false;
      this.elements.input.disabled = false;
      this.elements.form.querySelector("button").disabled = false;
      this.elements.input.focus();
    }
  }
}

new FloatingStudyAssistant();
