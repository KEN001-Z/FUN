"use strict";

const MAX_STUDY_MATERIAL_LENGTH = 24000;

class QuizSession {
  constructor(questions) {
    this.questions = questions;
    this.index = 0;
    this.answers = Array(questions.length).fill(null);
    this.selectedAnswer = null;
    this.isChecked = false;
    this.isComplete = false;
  }

  get score() {
    return this.answers.reduce((total, answer, index) =>
      total + (answer === this.questions[index].correctAnswerIndex ? 1 : 0), 0
    );
  }

  get answeredCount() {
    return this.answers.filter((answer) => answer !== null).length;
  }

  selectAnswer(index) {
    if (!this.isChecked) this.selectedAnswer = index;
  }

  checkAnswer() {
    if (this.selectedAnswer === null || this.isChecked) return;
    this.answers[this.index] = this.selectedAnswer;
    this.isChecked = true;
  }

  next() {
    if (!this.isChecked) return;
    this.index += 1;
    this.selectedAnswer = null;
    this.isChecked = false;
    this.isComplete = this.index >= this.questions.length;
  }

  retry() {
    this.index = 0;
    this.answers = Array(this.questions.length).fill(null);
    this.selectedAnswer = null;
    this.isChecked = false;
    this.isComplete = false;
  }
}

class Flashcard {
  constructor(question, answer) {
    this.question = question;
    this.answer = answer;
  }
}

class FlashcardGenerator {
  constructor() {
    this.stopWords = new Set([
      "about", "after", "again", "also", "among", "because", "before", "being",
      "between", "could", "does", "during", "each", "from", "have", "into",
      "more", "most", "often", "other", "over", "same", "some", "such", "than",
      "that", "their", "there", "these", "they", "this", "those", "through",
      "under", "used", "using", "very", "which", "while", "with", "would",
      "your", "when", "where", "what", "were", "will", "within", "without"
    ]);
  }

  generate(material) {
    const text = this.cleanMaterial(material);
    const explicitCards = this.readQuestionAnswerPairs(text);
    const qaLines = /^(?:Q|Question|A|Answer)\s*:/i;
    const sentenceText = text.split(/\r?\n/).filter((line) => !qaLines.test(line)).join(" ");
    const sentences = this.splitIntoSentences(sentenceText);
    const cards = [...explicitCards];

    for (const sentence of sentences) {
      if (cards.length >= 16) break;
      if (this.looksLikeQuestion(sentence)) continue;

      const definitionCard = this.makeDefinitionCard(sentence);
      if (definitionCard) {
        cards.push(definitionCard);
        continue;
      }

      const clozeCard = this.makeClozeCard(sentence);
      if (clozeCard) cards.push(clozeCard);
    }

    return this.removeDuplicates(cards).slice(0, 16);
  }

  cleanMaterial(material) {
    return material
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/^\s{0,3}#{1,6}\s*/gm, "")
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/^\s*\d+[.)]\s+/gm, "")
      .replace(/[*_`>#]/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{2,}/g, "\n")
      .trim();
  }

  readQuestionAnswerPairs(text) {
    const cards = [];
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

    for (let index = 0; index < lines.length; index += 1) {
      const question = lines[index].match(/^(?:Q|Question)\s*:\s*(.+)$/i);
      if (!question) continue;

      const answer = lines[index + 1]?.match(/^(?:A|Answer)\s*:\s*(.+)$/i);
      if (answer) {
        cards.push(new Flashcard(question[1], answer[1]));
        index += 1;
      }
    }

    return cards;
  }

  splitIntoSentences(text) {
    return text
      .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length >= 28 && sentence.length <= 280);
  }

  looksLikeQuestion(sentence) {
    return sentence.endsWith("?") || /^(?:Q|Question)\s*:/i.test(sentence);
  }

  makeDefinitionCard(sentence) {
    const definition = sentence.match(
      /^(.{2,65}?)\s+(?:is defined as|is known as|are known as|refers to|means|is|are)\s+(.{8,})$/i
    );
    if (!definition) return null;

    const subject = definition[1].replace(/^(?:the|a|an)\s+/i, "").trim();
    const answer = definition[2].replace(/[.!?]+$/, "").trim();
    if (!subject || !answer || subject.length > 65) return null;

    return new Flashcard(`What is ${subject}?`, answer);
  }

  makeClozeCard(sentence) {
    const words = [...sentence.matchAll(/[A-Za-z][A-Za-z'-]{4,}/g)];
    const candidates = words.filter((match) => !this.stopWords.has(match[0].toLowerCase()));
    if (candidates.length === 0) return null;

    const keyword = candidates.reduce((longest, candidate) =>
      candidate[0].length > longest[0].length ? candidate : longest
    );
    const answer = keyword[0].replace(/^['-]+|['-]+$/g, "");
    const questionText = sentence.slice(0, keyword.index)
      + "_____"
      + sentence.slice(keyword.index + keyword[0].length);

    return new Flashcard(`Fill in the missing idea: ${questionText}`, answer);
  }

  removeDuplicates(cards) {
    const seen = new Set();
    return cards.filter((card) => {
      const key = card.question.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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
    this.generator = new FlashcardGenerator();
    this.deckTitle = "A little space";
    this.isFlipped = false;
    this.mode = "cards";
    this.pdfJsPromise = null;
    this.session = new StudySession(this.makeSampleCards());
    this.quizSession = new QuizSession(this.makeSampleQuestions());
    this.elements = {
      studyPanel: document.querySelector(".study-panel"),
      studyKicker: document.querySelector("#study-kicker"),
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
      cardsTab: document.querySelector("#cards-tab"),
      quizTab: document.querySelector("#quiz-tab"),
      quizView: document.querySelector("#quiz-view"),
      quizMeta: document.querySelector(".quiz-meta"),
      quizCount: document.querySelector("#quiz-count"),
      quizScore: document.querySelector("#quiz-score"),
      quizQuestion: document.querySelector("#quiz-question"),
      quizOptions: document.querySelector("#quiz-options"),
      quizFeedback: document.querySelector("#quiz-feedback"),
      quizFeedbackTitle: document.querySelector("#quiz-feedback-title"),
      quizExplanation: document.querySelector("#quiz-explanation"),
      quizNextButton: document.querySelector("#quiz-next-button"),
      quizComplete: document.querySelector("#quiz-complete"),
      quizResultTitle: document.querySelector("#quiz-result-title"),
      quizResultCopy: document.querySelector("#quiz-result-copy")
    };

    this.bindEvents();
    this.render();
  }

  makeSampleCards() {
    return [
      new Flashcard("What is the closest star to Earth?", "The Sun."),
      new Flashcard("Fill in the missing idea: Earth takes about 365 days to _____ around the Sun.", "orbit"),
      new Flashcard("What is a light-year?", "The distance light travels in one year."),
      new Flashcard("Fill in the missing idea: The _____ is the largest planet in our solar system.", "Jupiter"),
      new Flashcard("What causes the phases of the Moon?", "We see different portions of its sunlit half as it orbits Earth."),
      new Flashcard("Fill in the missing idea: A planet's path around a star is called its _____.", "orbit")
    ];
  }

  makeSampleQuestions() {
    return [
      {
        question: "Which object is at the center of our solar system?",
        options: ["The Moon", "The Sun", "Jupiter", "Polaris"],
        correctAnswerIndex: 1,
        explanation: "The planets in our solar system orbit the Sun, which is its central star."
      },
      {
        question: "What is the name for the path a planet takes around a star?",
        options: ["An axis", "A crater", "An orbit", "A phase"],
        correctAnswerIndex: 2,
        explanation: "An orbit is the path one object follows as it moves around another in space."
      },
      {
        question: "About how long does Earth take to orbit the Sun once?",
        options: ["One day", "One month", "One year", "One decade"],
        correctAnswerIndex: 2,
        explanation: "One trip around the Sun takes Earth about 365 days, which makes a year."
      },
      {
        question: "Which planet is the largest in our solar system?",
        options: ["Mars", "Venus", "Saturn", "Jupiter"],
        correctAnswerIndex: 3,
        explanation: "Jupiter is the largest planet in the solar system."
      },
      {
        question: "What does a light-year measure?",
        options: ["A unit of distance", "A planet's age", "A star's brightness", "A unit of time"],
        correctAnswerIndex: 0,
        explanation: "A light-year is the distance light travels in one year."
      },
      {
        question: "Why do we see different phases of the Moon?",
        options: [
          "Earth's shadow always covers part of it",
          "The Moon changes its shape",
          "We see different portions of its sunlit half as it orbits Earth",
          "The Sun moves behind the Moon each night"
        ],
        correctAnswerIndex: 2,
        explanation: "The Moon is always half-lit by the Sun; its orbit changes how much of that lit half we see."
      }
    ];
  }

  bindEvents() {
    this.elements.card.addEventListener("click", () => this.flipCard());
    document.querySelector("#previous-button").addEventListener("click", () => this.movePrevious());
    document.querySelector("#next-button").addEventListener("click", () => this.moveNext());
    document.querySelector("#know-button").addEventListener("click", () => this.markKnown());
    document.querySelector("#practice-button").addEventListener("click", () => this.markForPractice());
    document.querySelector("#shuffle-button").addEventListener("click", () => this.shuffle());
    this.elements.generateButton.addEventListener("click", () => this.generateQuiz());
    document.querySelector("#sample-button").addEventListener("click", () => this.loadSampleDeck());
    this.elements.cardsTab.addEventListener("click", () => this.setMode("cards"));
    this.elements.quizTab.addEventListener("click", () => this.setMode("quiz"));
    this.elements.cardsTab.parentElement.addEventListener("keydown", (event) => {
      const tabs = [this.elements.cardsTab, this.elements.quizTab];
      const selectedIndex = tabs.indexOf(event.target);
      let nextIndex = selectedIndex;

      if (event.key === "ArrowRight") nextIndex = (selectedIndex + 1) % tabs.length;
      else if (event.key === "ArrowLeft") nextIndex = (selectedIndex - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = tabs.length - 1;
      else return;

      event.preventDefault();
      tabs[nextIndex].focus();
      this.setMode(nextIndex === 0 ? "cards" : "quiz");
    });
    this.elements.quizNextButton.addEventListener("click", () => this.advanceQuiz());
    document.querySelector("#retry-quiz-button").addEventListener("click", () => {
      this.quizSession.retry();
      this.renderQuiz();
    });
    this.elements.fileInput.addEventListener("change", (event) => this.readFile(event));

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
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || this.isTyping(event.target)) return;
      if (event.code === "Space" && this.mode === "cards") {
        event.preventDefault();
        this.flipCard();
      } else if (event.key === "ArrowRight" && this.mode === "cards") {
        this.moveNext();
      } else if (event.key === "ArrowLeft" && this.mode === "cards") {
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
      this.showMessage(`Added ${file.name}. Check the extracted text, then make your quiz.`, true);
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

  async generateQuiz() {
    const topic = this.elements.topicInput.value.trim();
    const material = this.elements.materialInput.value.trim();
    if (!topic && !material) {
      this.showMessage("Add a topic or some study material to get started.");
      this.elements.topicInput.focus();
      return;
    }
    if (material.length > MAX_STUDY_MATERIAL_LENGTH) {
      this.showMessage(`Study material is too long. Please shorten it to ${MAX_STUDY_MATERIAL_LENGTH.toLocaleString()} characters or less so the quiz is based on all of your notes.`);
      this.elements.materialInput.focus();
      return;
    }

    this.elements.generateButton.disabled = true;
    this.elements.generateButton.setAttribute("aria-busy", "true");
    this.elements.generateButtonLabel.textContent = "Making your quiz…";
    this.showMessage("Asking your study buddy…");
    try {
      const questions = await this.requestQuiz({ topic, material });
      this.quizSession = new QuizSession(questions);
      this.session = new StudySession(questions.map((question) =>
        new Flashcard(question.question, question.options[question.correctAnswerIndex])
      ));
      this.isFlipped = false;
      this.elements.sessionSummary.textContent = "";
      this.deckTitle = topic || "My practice quiz";
      this.setMode("quiz");
      this.render();
      this.showMessage(`${questions.length} flashcards and quiz questions ready. You’ve got this!`, true);
    } catch (error) {
      this.showMessage(`Couldn't make the quiz: ${error.message}`);
    } finally {
      this.elements.generateButton.disabled = false;
      this.elements.generateButton.removeAttribute("aria-busy");
      this.elements.generateButtonLabel.textContent = "Make my practice quiz";
    }
  }

  async requestQuiz({ topic, material }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    try {
      const response = await fetch("/api/generate-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, material }),
        signal: controller.signal
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `The quiz service returned HTTP ${response.status}.`);
      return this.validateQuestions(data);
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error("The request took too long. Try a smaller study guide.");
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

  setMode(mode) {
    this.mode = mode;
    const isQuiz = mode === "quiz";
    this.elements.studyPanel.classList.toggle("is-quiz", isQuiz);
    this.elements.studyKicker.textContent = isQuiz ? "CBT PRACTICE" : "YOUR DECK";
    this.elements.cardsTab.classList.toggle("is-active", !isQuiz);
    this.elements.cardsTab.setAttribute("aria-selected", String(!isQuiz));
    this.elements.cardsTab.tabIndex = isQuiz ? -1 : 0;
    this.elements.quizTab.classList.toggle("is-active", isQuiz);
    this.elements.quizTab.setAttribute("aria-selected", String(isQuiz));
    this.elements.quizTab.tabIndex = isQuiz ? 0 : -1;
    this.elements.quizView.hidden = !isQuiz;
    if (isQuiz) this.renderQuiz();
    else this.render();
  }

  renderQuiz() {
    const session = this.quizSession;
    if (session.questions.length === 0) {
      this.elements.quizMeta.hidden = true;
      this.elements.quizQuestion.hidden = true;
      this.elements.quizOptions.hidden = true;
      this.elements.quizFeedback.hidden = true;
      this.elements.quizComplete.hidden = false;
      this.elements.quizNextButton.hidden = true;
      this.elements.quizResultTitle.textContent = "No practice quiz yet";
      this.elements.quizResultCopy.textContent = "Add a topic or study material, then make a quiz to begin.";
      return;
    }

    const isComplete = session.isComplete;
    const question = session.questions[session.index];
    this.elements.quizMeta.hidden = isComplete;
    this.elements.quizQuestion.hidden = isComplete;
    this.elements.quizOptions.hidden = isComplete;
    this.elements.quizFeedback.hidden = isComplete || !session.isChecked;
    this.elements.quizComplete.hidden = !isComplete;
    this.elements.quizNextButton.hidden = isComplete;

    if (isComplete) {
      this.elements.quizResultTitle.textContent = session.score === session.questions.length
        ? "Perfect score!"
        : "Nice work!";
      this.elements.quizResultCopy.textContent =
        `You got ${session.score} of ${session.questions.length} questions correct.`;
      this.elements.progressFill.style.width = "100%";
      this.elements.progressLabel.textContent = `${session.questions.length} of ${session.questions.length} answered`;
      this.elements.progressBar.setAttribute("aria-valuemax", String(session.questions.length));
      this.elements.progressBar.setAttribute("aria-valuenow", String(session.questions.length));
      return;
    }

    this.elements.quizCount.textContent =
      `${String(session.index + 1).padStart(2, "0")} / ${String(session.questions.length).padStart(2, "0")}`;
    this.elements.quizScore.textContent = `${session.score} correct`;
    this.elements.quizQuestion.textContent = question.question;
    this.elements.quizOptions.replaceChildren();
    question.options.forEach((option, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "quiz-option";
      button.disabled = session.isChecked;
      button.setAttribute("aria-pressed", String(session.selectedAnswer === index));
      button.classList.toggle("is-selected", session.selectedAnswer === index);
      if (session.isChecked && index === question.correctAnswerIndex) {
        button.classList.add("is-correct");
      } else if (session.isChecked && index === session.selectedAnswer) {
        button.classList.add("is-incorrect");
      }
      const letter = document.createElement("span");
      letter.className = "option-letter";
      letter.setAttribute("aria-hidden", "true");
      letter.textContent = String.fromCharCode(65 + index);
      button.append(letter, document.createTextNode(option));
      button.addEventListener("click", () => {
        session.selectAnswer(index);
        this.renderQuiz();
        this.elements.quizOptions.querySelector(".is-selected")?.focus();
      });
      this.elements.quizOptions.append(button);
    });

    if (session.isChecked) {
      const isCorrect = session.answers[session.index] === question.correctAnswerIndex;
      this.elements.quizFeedback.classList.toggle("is-wrong", !isCorrect);
      this.elements.quizFeedbackTitle.textContent = isCorrect
        ? "That's right!"
        : `Not quite. The correct answer is ${question.options[question.correctAnswerIndex]}.`;
      this.elements.quizExplanation.textContent = question.explanation;
      this.elements.quizNextButton.disabled = false;
      this.elements.quizNextButton.innerHTML = session.index === session.questions.length - 1
        ? 'See results <span aria-hidden="true">→</span>'
        : 'Next question <span aria-hidden="true">→</span>';
    } else {
      this.elements.quizFeedback.classList.remove("is-wrong");
      this.elements.quizNextButton.disabled = session.selectedAnswer === null;
      this.elements.quizNextButton.innerHTML = session.selectedAnswer === null
        ? 'Choose an answer <span aria-hidden="true">→</span>'
        : 'Check answer <span aria-hidden="true">→</span>';
    }

    const answered = session.answeredCount;
    this.elements.progressFill.style.width = `${(answered / session.questions.length) * 100}%`;
    this.elements.progressLabel.textContent = `${answered} of ${session.questions.length} answered`;
    this.elements.progressBar.setAttribute("aria-valuemax", String(session.questions.length));
    this.elements.progressBar.setAttribute("aria-valuenow", String(answered));
  }

  advanceQuiz() {
    if (!this.quizSession.isChecked) {
      this.quizSession.checkAnswer();
    } else {
      this.quizSession.next();
    }
    this.renderQuiz();
  }

  loadSampleDeck() {
    this.deckTitle = "A little space";
    this.session = new StudySession(this.makeSampleCards());
    this.quizSession = new QuizSession(this.makeSampleQuestions());
    this.isFlipped = false;
    this.elements.topicInput.value = "The solar system";
    this.elements.materialInput.value = "";
    this.elements.sessionSummary.textContent = "";
    this.setMode("cards");
    this.render();
    this.showMessage("Sample deck and CBT quiz loaded. Pick a study mode to play!", true);
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
    if (this.mode === "quiz") {
      this.renderQuiz();
      return;
    }
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
}

new FlashcardApp();
