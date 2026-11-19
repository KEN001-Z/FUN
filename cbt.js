"use strict";

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

class CbtPracticePage {
  constructor() {
    this.elements = {
      empty: document.querySelector("#cbt-empty"),
      status: document.querySelector("#cbt-status"),
      workspace: document.querySelector("#cbt-workspace"),
      topic: document.querySelector("#cbt-topic"),
      progressBar: document.querySelector("#progress-bar"),
      progressFill: document.querySelector("#progress-fill"),
      progressLabel: document.querySelector("#progress-label"),
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
      quizResultCopy: document.querySelector("#quiz-result-copy"),
      gradeSummary: document.querySelector("#grade-summary"),
      missedReview: document.querySelector("#missed-review"),
      missedReviewTitle: document.querySelector("#missed-review-title"),
      missedCount: document.querySelector("#missed-count"),
      missedReviewList: document.querySelector("#missed-review-list")
    };

    this.quizSession = null;
    this.historySaved = false;
    this.loadSession();
  }

  loadSession() {
    let storedSession;
    try {
      storedSession = sessionStorage.getItem("little-loop-practice");
    } catch (error) {
      this.showEmptyState("Your browser couldn’t open this practice session. Please create a new quiz.");
      return;
    }

    if (!storedSession) {
      this.showEmptyState();
      return;
    }

    let session;
    try {
      session = JSON.parse(storedSession);
    } catch {
      sessionStorage.removeItem("little-loop-practice");
      this.showEmptyState("This practice session couldn’t be read. Please create a new quiz.");
      return;
    }

    if (!this.isValidSession(session)) {
      sessionStorage.removeItem("little-loop-practice");
      this.showEmptyState("This practice session is incomplete. Please create a new quiz.");
      return;
    }

    this.quizSession = new QuizSession(session.questions);
    this.elements.topic.textContent = session.topic || "My practice quiz";
    this.elements.empty.hidden = true;
    this.elements.workspace.hidden = false;
    this.elements.quizNextButton.addEventListener("click", () => this.advance());
    document.querySelector("#retry-quiz-button").addEventListener("click", () => {
      this.quizSession.retry();
      this.historySaved = false;
      this.render();
    });
    this.render();
  }

  isValidSession(session) {
    return session
      && typeof session === "object"
      && typeof session.topic === "string"
      && Array.isArray(session.questions)
      && session.questions.length === 6
      && session.questions.every((question) =>
        typeof question?.question === "string"
        && question.question.trim()
        && Array.isArray(question.options)
        && question.options.length === 4
        && question.options.every((option) => typeof option === "string" && option.trim())
        && Number.isInteger(question.correctAnswerIndex)
        && question.correctAnswerIndex >= 0
        && question.correctAnswerIndex < 4
        && typeof question.explanation === "string"
        && question.explanation.trim()
      );
  }

  showEmptyState(message = "Make a quiz from a topic or your own study notes, then come back here to practice.") {
    this.elements.status.textContent = message;
    this.elements.empty.hidden = false;
    this.elements.workspace.hidden = true;
  }

  render() {
    const session = this.quizSession;
    const isComplete = session.isComplete;
    const question = session.questions[session.index];
    this.elements.quizMeta.hidden = isComplete;
    this.elements.quizQuestion.hidden = isComplete;
    this.elements.quizOptions.hidden = isComplete;
    this.elements.quizFeedback.hidden = isComplete || !session.isChecked;
    this.elements.quizComplete.hidden = !isComplete;
    this.elements.quizNextButton.hidden = isComplete;

    if (isComplete) {
      const percentage = Math.round((session.score / session.questions.length) * 100);
      this.elements.quizResultTitle.textContent = percentage === 100
        ? "Perfect score!"
        : percentage >= 67
          ? "Strong work!"
          : "Every answer teaches you.";
      this.elements.quizResultCopy.textContent =
        `You got ${session.score} of ${session.questions.length} questions correct.`;
      this.elements.gradeSummary.textContent =
        `${percentage}% · ${percentage === 100 ? "Mastered" : percentage >= 67 ? "Almost there" : "Keep practicing"}`;
      this.renderMissedReview();
      if (!this.historySaved) this.savePracticeHistory();
      this.updateProgress(session.questions.length);
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
        this.render();
        this.elements.quizOptions.querySelector(".is-selected")?.focus();
      });
      this.elements.quizOptions.append(button);
    });

    if (session.isChecked) {
      const isCorrect = session.answers[session.index] === question.correctAnswerIndex;
      this.elements.quizFeedback.classList.toggle("is-wrong", !isCorrect);
      this.elements.quizFeedbackTitle.textContent = isCorrect
        ? "That’s right!"
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

    this.updateProgress(session.answeredCount);
  }

  updateProgress(answered) {
    const total = this.quizSession.questions.length;
    this.elements.progressFill.style.width = `${(answered / total) * 100}%`;
    this.elements.progressLabel.textContent = `${answered} of ${total} answered`;
    this.elements.progressBar.setAttribute("aria-valuemax", String(total));
    this.elements.progressBar.setAttribute("aria-valuenow", String(answered));
  }

  renderMissedReview() {
    const session = this.quizSession;
    const missed = session.questions.map((question, index) => ({
      question,
      selectedAnswer: session.answers[index]
    })).filter((item) => item.selectedAnswer !== item.question.correctAnswerIndex);

    this.elements.missedReview.hidden = missed.length === 0;
    this.elements.missedCount.textContent =
      `${missed.length} ${missed.length === 1 ? "to review" : "to review"}`;
    this.elements.missedReviewList.replaceChildren();

    missed.forEach(({ question, selectedAnswer }, index) => {
      const item = document.createElement("article");
      item.className = "missed-item";

      const title = document.createElement("h4");
      title.textContent = `${index + 1}. ${question.question}`;

      const userAnswer = document.createElement("p");
      userAnswer.className = "missed-user-answer";
      userAnswer.textContent = selectedAnswer === null
        ? "Your answer: Not answered"
        : `Your answer: ${question.options[selectedAnswer]}`;

      const correctAnswer = document.createElement("p");
      correctAnswer.className = "missed-correct-answer";
      correctAnswer.textContent = `Correct answer: ${question.options[question.correctAnswerIndex]}`;

      const explanation = document.createElement("p");
      explanation.className = "missed-explanation";
      explanation.textContent = question.explanation;

      item.append(title, userAnswer, correctAnswer, explanation);
      this.elements.missedReviewList.append(item);
    });
  }

  savePracticeHistory() {
    const session = this.quizSession;
    const missed = session.questions.map((question, index) => ({
      question: question.question,
      selectedAnswer: session.answers[index] === null
        ? null
        : question.options[session.answers[index]],
      correctAnswer: question.options[question.correctAnswerIndex],
      explanation: question.explanation
    })).filter((item, index) =>
      session.answers[index] !== session.questions[index].correctAnswerIndex
    );

    let history = [];
    try {
      history = JSON.parse(localStorage.getItem("little-loop-practice-history") || "[]");
      if (!Array.isArray(history)) history = [];
    } catch {
      history = [];
    }

    const topic = this.elements.topic.textContent || "Practice quiz";
    history.unshift({
      topic,
      score: session.score,
      total: session.questions.length,
      missed,
      completedAt: new Date().toISOString()
    });
    localStorage.setItem("little-loop-practice-history", JSON.stringify(history.slice(0, 20)));
    this.historySaved = true;
  }

  advance() {
    if (!this.quizSession.isChecked) this.quizSession.checkAnswer();
    else this.quizSession.next();
    this.render();
  }
}

new CbtPracticePage();
