"use strict";

const MAX_STUDY_MATERIAL_LENGTH = 24000;

class Flashcard {
  constructor(question, answer) {
    this.question = question;
    this.answer = answer;
  }
}

class StudySession {
  constructor(cards) {
    this.cards = cards;
    this.index = 0;
    this.practiced = new Set();
    this.known = new Set();
  }

  get currentCard() {
    return this.cards[this.index] ?? null;
  }

  get practicedCount() {
    return this.practiced.size;
  }

  next() {
    if (this.cards.length === 0) return;
    this.index = (this.index + 1) % this.cards.length;
  }

  previous() {
    if (this.cards.length === 0) return;
    this.index = (this.index - 1 + this.cards.length) % this.cards.length;
  }

  markKnown() {
    if (this.cards.length === 0) return;
    const card = this.currentCard;
    if (!card) return;
    this.practiced.add(card);
    this.known.add(card);
    this.next();
  }

  markForPractice() {
    if (this.cards.length === 0) return;
    const card = this.currentCard;
    if (!card) return;
    this.practiced.add(card);
    this.known.delete(card);
    this.next();
  }

  shuffle() {
    if (this.cards.length < 2) return;
    for (let index = this.cards.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [this.cards[index], this.cards[swapIndex]] = [this.cards[swapIndex], this.cards[index]];
    }
    this.index = 0;
  }
}

class FlashcardApp {
  constructor() {
    this.deckTitle = "My study deck";
    this.isFlipped = false;
    this.pdfJsPromise = null;
    this.session = new StudySession([]);
    this.elements = {
      card: document.querySelector("#flashcard"),
      cardContent: document.querySelector("#card-content"),
      cardTag: document.querySelector("#card-tag"),
      cardCount: document.querySelector("#card-count"),
      cardHint: document.querySelector("#card-hint"),
      deckTitle: document.querySelector("#deck-title"),
      progressBar: document.querySelector("#progress-bar"),
      progressFill: document.querySelector("#progress-fill"),
      progressLabel: document.querySelector("#progress-label"),
      sessionSummary: document.querySelector("#session-summary"),
      topicInput: document.querySelector("#topic-input"),
      materialInput: document.querySelector("#material-input"),
      fileInput: document.querySelector("#file-input"),
      formMessage: document.querySelector("#form-message"),
      generateButton: document.querySelector("#generate-button"),
      generateButtonLabel: document.querySelector(".button-label"),
      flashcardsButton: document.querySelector("#flashcards-button"),
      studyPlanButton: document.querySelector("#study-plan-button"),
      tutorButton: document.querySelector("#tutor-button"),
      tutorQuestion: document.querySelector("#tutor-question"),
      assistantResponse: document.querySelector("#assistant-response"),
      assistantResponseTitle: document.querySelector("#assistant-response-title"),
      assistantResponseContent: document.querySelector("#assistant-response-content")
    };

    this.bindEvents();
    this.renderPracticeHistory();
    this.render();
  }

  bindEvents() {
    this.elements.card.addEventListener("click", () => this.flipCard());
    document.querySelector("#previous-button").addEventListener("click", () => this.movePrevious());
    document.querySelector("#next-button").addEventListener("click", () => this.moveNext());
    document.querySelector("#know-button").addEventListener("click", () => this.markKnown());
    document.querySelector("#practice-button").addEventListener("click", () => this.markForPractice());
    document.querySelector("#shuffle-button").addEventListener("click", () => this.shuffle());
    this.elements.generateButton.addEventListener("click", () => this.runStudyTask("quiz", this.elements.generateButton));
    this.elements.flashcardsButton.addEventListener("click", () => this.runStudyTask("flashcards", this.elements.flashcardsButton));
    this.elements.studyPlanButton.addEventListener("click", () => this.runStudyTask("study_plan", this.elements.studyPlanButton));
    this.elements.tutorButton.addEventListener("click", () => this.runStudyTask("tutor", this.elements.tutorButton));
    this.elements.fileInput.addEventListener("change", (event) => this.readFile(event));
    document.querySelector("#clear-history-button").addEventListener("click", () => this.clearPracticeHistory());

    const uploadZone = document.querySelector(".upload-zone");
    for (const eventName of ["dragenter", "dragover"]) {
      uploadZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        uploadZone.classList.add("is-dragging");
      });
    }
    for (const eventName of ["dragleave", "drop"]) {
      uploadZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        uploadZone.classList.remove("is-dragging");
      });
    }
    uploadZone.addEventListener("drop", (event) => this.readDroppedFile(event));

    document.addEventListener("keydown", (event) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.code === "Space" && event.target === this.elements.card) {
        event.preventDefault();
        this.flipCard();
        return;
      }
      if (this.isTyping(event.target)) return;
      if (event.code === "Space") {
        event.preventDefault();
        this.flipCard();
      } else if (event.key === "ArrowRight") {
        this.moveNext();
      } else if (event.key === "ArrowLeft") {
        this.movePrevious();
      }
    });
  }

  isTyping(target) {
    return target instanceof HTMLElement
      && (target.isContentEditable
        || ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(target.tagName)
        || target.closest("[role='button']") !== null);
  }

  async readFile(event) {
    const [file] = event.target.files ?? [];
    if (file) await this.loadFile(file);
    event.target.value = "";
  }

  async readDroppedFile(event) {
    const [file] = event.dataTransfer?.files ?? [];
    if (file) await this.loadFile(file);
  }

  async loadFile(file) {
    if (!/\.(pdf|txt|md)$/i.test(file.name)) {
      this.showMessage("Please choose a .pdf, .txt, or .md study file.");
      return;
    }
    try {
      this.elements.materialInput.value = /\.pdf$/i.test(file.name)
        ? await this.extractPdfText(file)
        : await file.text();
      if (!this.elements.topicInput.value.trim()) {
        this.elements.topicInput.value = file.name.replace(/\.(pdf|txt|md)$/i, "").replace(/[-_]/g, " ");
      }
      this.showMessage(`Added ${file.name}. Check the extracted text, then choose a study activity.`, true);
    } catch (error) {
      this.showMessage(`Couldn't read that file: ${error.message}`);
    }
  }

  async extractPdfText(file) {
    if (!this.pdfJsPromise) {
      this.pdfJsPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
        script.onload = () => {
          if (!window.pdfjsLib) {
            this.pdfJsPromise = null;
            reject(new Error("The PDF reader could not be initialized."));
            return;
          }
          window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
          resolve(window.pdfjsLib);
        };
        script.onerror = () => {
          this.pdfJsPromise = null;
          reject(new Error("Couldn't load the PDF reader. Check your internet connection and try again."));
        };
        document.head.append(script);
      });
    }

    const pdfjsLib = await this.pdfJsPromise;
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .filter((item) => "str" in item)
        .map((item) => item.str)
        .join(" ");
      pages.push(pageText);
    }

    const text = pages.join("\n").trim();
    if (!text) {
      throw new Error("No selectable text was found. Scanned PDFs need OCR before they can be used.");
    }
    return text;
  }

  async runStudyTask(task, button) {
    const topic = this.elements.topicInput.value.trim();
    const material = this.elements.materialInput.value.trim();
    const question = this.elements.tutorQuestion.value.trim();
    if (task === "tutor" ? !question : !topic && !material) {
      this.showMessage(task === "tutor" ? "Add a question for your study tutor." : "Add a topic or some study material to get started.");
      (task === "tutor" ? this.elements.tutorQuestion : this.elements.topicInput).focus();
      return;
    }
    if (material.length > MAX_STUDY_MATERIAL_LENGTH) {
      this.showMessage(`Study material is too long. Please shorten it to ${MAX_STUDY_MATERIAL_LENGTH.toLocaleString()} characters or less so the quiz is based on all of your notes.`);
      this.elements.materialInput.focus();
      return;
    }

    const actionButtons = [
      this.elements.generateButton,
      this.elements.flashcardsButton,
      this.elements.studyPlanButton,
      this.elements.tutorButton
    ];
    const originalLabel = button === this.elements.generateButton
      ? this.elements.generateButtonLabel.textContent
      : button.textContent;
    for (const actionButton of actionButtons) actionButton.disabled = true;
    button.setAttribute("aria-busy", "true");
    if (button === this.elements.generateButton) {
      this.elements.generateButtonLabel.textContent = "Preparing your quiz…";
    } else {
      button.textContent = "Working on it…";
    }
    this.showMessage("Asking your study buddy…");
    try {
      const result = await this.requestStudyTask(task, { topic, material, question });
      this.elements.assistantResponse.hidden = true;
      if (task === "quiz") {
        const questions = this.validateQuestions(result);
        sessionStorage.setItem("little-loop-practice", JSON.stringify({ topic, questions }));
        window.location.assign("cbt.html");
      } else if (task === "flashcards") {
        const cards = this.validateFlashcards(result);
        this.session = new StudySession(cards.map((card) => new Flashcard(card.question, card.answer)));
        this.deckTitle = topic || "My flashcards";
        this.isFlipped = false;
        this.elements.sessionSummary.textContent = "";
        this.render();
        this.showMessage(`${cards.length} flashcards are ready to study.`, true);
      } else if (task === "tutor") {
        this.showAssistantResponse("Your study tutor", result.answer);
        this.showMessage("Here's an explanation to help you understand.", true);
      } else {
        this.showAssistantResponse("Your study plan", result.plan);
        this.showMessage("Your focused study plan is ready.", true);
      }
    } catch (error) {
      this.showMessage(`Couldn't complete that study activity: ${error.message}`);
    } finally {
      for (const actionButton of actionButtons) actionButton.disabled = false;
      button.removeAttribute("aria-busy");
      if (button === this.elements.generateButton) {
        this.elements.generateButtonLabel.textContent = originalLabel;
      } else {
        button.textContent = originalLabel;
      }
    }
  }

  async requestStudyTask(task, { topic, material, question }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 85000);
    try {
      const response = await fetch("/api/study-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, topic, material, question }),
        signal: controller.signal
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `The study service returned HTTP ${response.status}.`);
      return data;
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error("The request took too long. Try again with shorter study notes.");
      }
      if (error instanceof TypeError) {
        throw new Error("Couldn't reach Little Loop. Start the app server and try again.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  validateQuestions(result) {
    const questions = result?.questions;
    if (!Array.isArray(questions) || questions.length !== 6) {
      throw new Error("The AI didn't return all 6 questions. Add more study material or try a narrower topic.");
    }
    const seenQuestions = new Set();
    const validQuestions = questions.map((question) => {
      const valid = typeof question?.question === "string"
        && question.question.trim()
        && Array.isArray(question.options)
        && question.options.length === 4
        && question.options.every((option) => typeof option === "string" && option.trim())
        && Number.isInteger(question.correctAnswerIndex)
        && question.correctAnswerIndex >= 0
        && question.correctAnswerIndex < 4
        && typeof question.explanation === "string"
        && question.explanation.trim();
      if (!valid) throw new Error("The AI returned an incomplete question. Please try again.");
      const validatedQuestion = {
        question: question.question.trim(),
        options: question.options.map((option) => option.trim()),
        correctAnswerIndex: question.correctAnswerIndex,
        explanation: question.explanation.trim()
      };
      const questionKey = validatedQuestion.question.replace(/\s+/g, " ").toLowerCase();
      const optionKeys = validatedQuestion.options.map((option) => option.replace(/\s+/g, " ").toLowerCase());
      if (seenQuestions.has(questionKey) || new Set(optionKeys).size !== optionKeys.length) {
        throw new Error("The AI returned duplicate questions or answer choices. Please try again.");
      }
      seenQuestions.add(questionKey);
      return validatedQuestion;
    });
    return validQuestions;
  }

  validateFlashcards(result) {
    const cards = result?.cards;
    if (!Array.isArray(cards) || cards.length < 1 || cards.length > 16
      || cards.some((card) =>
        typeof card?.question !== "string" || !card.question.trim()
        || typeof card?.answer !== "string" || !card.answer.trim()
      )) {
      throw new Error("The AI returned invalid flashcards. Please try again.");
    }
    return cards.map((card) => ({ question: card.question.trim(), answer: card.answer.trim() }));
  }

  showAssistantResponse(title, content) {
    this.elements.assistantResponseTitle.textContent = title;
    this.elements.assistantResponseContent.textContent = content;
    this.elements.assistantResponse.hidden = false;
  }

  flipCard() {
    if (this.session.cards.length === 0) return;
    this.isFlipped = !this.isFlipped;
    this.renderCard();
  }

  moveNext() {
    if (this.session.cards.length === 0) return;
    this.session.next();
    this.isFlipped = false;
    this.render();
  }

  movePrevious() {
    if (this.session.cards.length === 0) return;
    this.session.previous();
    this.isFlipped = false;
    this.render();
  }

  markKnown() {
    if (this.session.cards.length === 0) return;
    this.session.markKnown();
    this.isFlipped = false;
    this.updateSummary();
    this.render();
  }

  markForPractice() {
    if (this.session.cards.length === 0) return;
    this.session.markForPractice();
    this.isFlipped = false;
    this.updateSummary();
    this.render();
  }

  shuffle() {
    if (this.session.cards.length === 0) return;
    this.session.shuffle();
    this.isFlipped = false;
    this.elements.sessionSummary.textContent = "";
    this.render();
  }

  updateSummary() {
    if (this.session.cards.length === 0) {
      this.elements.sessionSummary.textContent = "No cards yet — add study material to begin.";
      return;
    }
    const known = this.session.known.size;
    this.elements.sessionSummary.textContent = known === this.session.cards.length
      ? "Every card mastered — look at you! ✨"
      : `${known} ${known === 1 ? "card" : "cards"} got it so far ✨`;
  }

  render() {
    this.elements.deckTitle.textContent = this.deckTitle;
    this.renderCard();
    const total = this.session.cards.length;
    const practiced = this.session.practicedCount;
    const progressPercent = total === 0 ? 0 : (practiced / total) * 100;
    this.elements.progressFill.style.width = `${progressPercent}%`;
    this.elements.progressLabel.textContent = `${practiced} of ${total} practiced`;
    this.elements.progressBar.setAttribute("aria-valuemax", String(total));
    this.elements.progressBar.setAttribute("aria-valuenow", String(practiced));
  }

  renderCard() {
    const total = this.session.cards.length;
    if (total === 0) {
      this.elements.cardContent.textContent = "No flashcards yet";
      this.elements.cardTag.textContent = "STUDY DECK";
      this.elements.cardCount.textContent = "00 / 00";
      this.elements.cardHint.innerHTML = 'add notes to start <span aria-hidden="true">↗</span>';
      this.elements.card.classList.remove("is-flipped");
      this.elements.card.setAttribute("aria-label", "Study deck is empty. Add notes or a file to generate flashcards.");
      return;
    }

    const card = this.session.currentCard;
    this.elements.cardContent.textContent = this.isFlipped ? card.answer : card.question;
    this.elements.cardTag.textContent = this.isFlipped ? "THE ANSWER" : "QUICK QUESTION";
    this.elements.cardCount.textContent = `${String(this.session.index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
    this.elements.cardHint.innerHTML = this.isFlipped
      ? 'tap to see the question <span aria-hidden="true">↗</span>'
      : 'tap anywhere to flip <span aria-hidden="true">↗</span>';
    this.elements.card.classList.toggle("is-flipped", this.isFlipped);
    this.elements.card.setAttribute("aria-label", `${this.isFlipped ? "Answer" : "Question"}: ${this.elements.cardContent.textContent}. Press to ${this.isFlipped ? "see the question" : "reveal the answer"}.`);
  }

  showMessage(message, isSuccess = false) {
    this.elements.formMessage.textContent = message;
    this.elements.formMessage.classList.toggle("success", isSuccess);
  }

  getPracticeHistory() {
    try {
      const history = JSON.parse(localStorage.getItem("little-loop-practice-history") || "[]");
      return Array.isArray(history) ? history : [];
    } catch {
      return [];
    }
  }

  clearPracticeHistory() {
    localStorage.removeItem("little-loop-practice-history");
    this.renderPracticeHistory();
  }

  renderPracticeHistory() {
    const history = this.getPracticeHistory();
    const section = document.querySelector("#practice-history");
    const list = document.querySelector("#practice-history-list");
    section.hidden = history.length === 0;
    list.replaceChildren();

    history.slice(0, 8).forEach((attempt) => {
      const item = document.createElement("article");
      item.className = "history-item";

      const heading = document.createElement("div");
      heading.className = "history-item-heading";
      const title = document.createElement("strong");
      title.textContent = attempt.topic || "Practice quiz";
      const score = document.createElement("span");
      const correct = Number.isInteger(attempt.score) ? attempt.score : 0;
      const total = Number.isInteger(attempt.total) ? attempt.total : 6;
      score.textContent = `${correct}/${total}`;
      heading.append(title, score);

      const meta = document.createElement("p");
      const date = attempt.completedAt ? new Date(attempt.completedAt) : null;
      const missed = Array.isArray(attempt.missed) ? attempt.missed.length : 0;
      meta.textContent = date && !Number.isNaN(date.valueOf())
        ? `${date.toLocaleDateString()} · ${missed} ${missed === 1 ? "question" : "questions"} to review`
        : `${missed} ${missed === 1 ? "question" : "questions"} to review`;

      item.append(heading, meta);
      if (Array.isArray(attempt.missed) && attempt.missed.length > 0) {
        const details = document.createElement("div");
        details.className = "history-missed-details";
        attempt.missed.slice(0, 5).forEach((missedItem) => {
          const card = document.createElement("article");
          card.className = "history-missed-item";

          const question = document.createElement("strong");
          question.textContent = missedItem.question || "Past question";

          const userAnswer = document.createElement("p");
          userAnswer.textContent = missedItem.selectedAnswer === null
            ? "Your answer: Not answered"
            : `Your answer: ${missedItem.selectedAnswer || "No answer"}`;

          const correctAnswer = document.createElement("p");
          correctAnswer.className = "history-correct-answer";
          correctAnswer.textContent = `Correct answer: ${missedItem.correctAnswer || "Unavailable"}`;

          const explanation = document.createElement("p");
          explanation.textContent = missedItem.explanation || "";

          card.append(question, userAnswer, correctAnswer, explanation);
          details.append(card);
        });
        item.append(details);
      }
      list.append(item);
    });
  }
}

new FlashcardApp();
