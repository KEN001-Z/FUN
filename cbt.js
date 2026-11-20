"use strict";

const EXAM_DURATION_SECONDS = 10 * 60;

class QuizSession {
  constructor(questions) {
    this.questions = questions;
    this.index = 0;
    this.answers = Array(questions.length).fill(null);
    this.markedForReview = new Set();
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
    if (!this.isComplete) this.answers[this.index] = index;
  }

  moveTo(index) {
    if (Number.isInteger(index) && index >= 0 && index < this.questions.length && !this.isComplete) {
      this.index = index;
    }
  }

  toggleReview() {
    if (this.markedForReview.has(this.index)) this.markedForReview.delete(this.index);
    else this.markedForReview.add(this.index);
  }

  retry() {
    this.index = 0;
    this.answers.fill(null);
    this.markedForReview.clear();
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
      progressLabel: document.querySelector("#exam-progress-label"),
      answeredLabel: document.querySelector("#answered-label"),
      quizCount: document.querySelector("#quiz-count"),
      quizQuestion: document.querySelector("#quiz-question"),
      quizOptions: document.querySelector("#quiz-options"),
      quizComplete: document.querySelector("#quiz-complete"),
      quizResultTitle: document.querySelector("#quiz-result-title"),
      quizResultCopy: document.querySelector("#quiz-result-copy"),
      resultScore: document.querySelector("#result-score"),
      resultPercentage: document.querySelector("#result-percentage"),
      resultTime: document.querySelector("#result-time"),
      gradeSummary: document.querySelector("#grade-summary"),
      missedReview: document.querySelector("#missed-review"),
      missedCount: document.querySelector("#missed-count"),
      missedReviewList: document.querySelector("#missed-review-list"),
      reviewFlag: document.querySelector("#review-flag"),
      timer: document.querySelector("#exam-timer"),
      timerLabel: document.querySelector("#timer-label"),
      questionNavigation: document.querySelector("#question-navigation"),
      examControls: document.querySelector("#exam-controls"),
      previousButton: document.querySelector("#previous-question-button"),
      nextButton: document.querySelector("#next-question-button"),
      markReviewButton: document.querySelector("#mark-review-button"),
      submitButton: document.querySelector("#submit-exam-button"),
      retryButton: document.querySelector("#retry-quiz-button"),
      newQuizButton: document.querySelector("#new-quiz-button"),
      reviewToggle: document.querySelector("#review-toggle"),
      answerReview: document.querySelector("#answer-review")
    };
    this.quizSession = null;
    this.historySaved = false;
    this.startedAt = 0;
    this.deadline = 0;
    this.remainingSeconds = EXAM_DURATION_SECONDS;
    this.timerInterval = null;
    this.loadSession();
  }

  loadSession() {
    let storedSession;
    try {
      storedSession = sessionStorage.getItem("little-loop-practice");
    } catch {
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
    this.elements.previousButton.addEventListener("click", () => this.moveQuestion(-1));
    this.elements.nextButton.addEventListener("click", () => this.moveQuestion(1));
    this.elements.markReviewButton.addEventListener("click", () => {
      this.quizSession.toggleReview();
      this.render();
    });
    this.elements.submitButton.addEventListener("click", () => this.confirmSubmit());
    this.elements.retryButton.addEventListener("click", () => this.retry());
    this.elements.newQuizButton.addEventListener("click", () => window.location.assign("index.html#create"));
    this.elements.reviewToggle.addEventListener("click", () => this.toggleAnswerReview());
    this.startTimer();
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

  showEmptyState(message = "Make a quiz from a topic or your own study notes, then come back here to practise.") {
    this.elements.status.textContent = message;
    this.elements.empty.hidden = false;
    this.elements.workspace.hidden = true;
  }

  startTimer() {
    clearInterval(this.timerInterval);
    this.startedAt = Date.now();
    this.deadline = this.startedAt + EXAM_DURATION_SECONDS * 1000;
    this.remainingSeconds = EXAM_DURATION_SECONDS;
    this.timerInterval = setInterval(() => {
      this.remainingSeconds = Math.max(0, Math.ceil((this.deadline - Date.now()) / 1000));
      this.renderTimer();
      if (this.remainingSeconds === 0) this.submitExam();
    }, 1000);
    this.renderTimer();
  }

  renderTimer() {
    const minutes = Math.floor(this.remainingSeconds / 60);
    const seconds = this.remainingSeconds % 60;
    this.elements.timerLabel.textContent = `${minutes}:${String(seconds).padStart(2, "0")}`;
    this.elements.timer.classList.toggle("is-low", this.remainingSeconds <= 60);
  }

  render() {
    const session = this.quizSession;
    const isComplete = session.isComplete;
    this.elements.quizComplete.hidden = !isComplete;
    this.elements.quizQuestion.hidden = isComplete;
    this.elements.quizOptions.hidden = isComplete;
    this.elements.examControls.hidden = isComplete;
    this.elements.timer.hidden = isComplete;
    this.elements.workspace.classList.toggle("is-complete", isComplete);
    this.elements.questionNavigation.closest(".cbt-guide").hidden = isComplete;

    if (isComplete) {
      this.renderResults();
      this.elements.progressLabel.textContent = "Exam submitted";
      this.elements.answeredLabel.textContent = `${session.answeredCount} of ${session.questions.length} answered`;
      this.updateProgress(session.answeredCount);
      this.renderNavigation();
      return;
    }

    const question = session.questions[session.index];
    this.elements.quizCount.textContent =
      `${String(session.index + 1).padStart(2, "0")} / ${String(session.questions.length).padStart(2, "0")}`;
    this.elements.quizQuestion.textContent = question.question;
    this.elements.quizOptions.replaceChildren();
    question.options.forEach((option, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "quiz-option";
      button.setAttribute("aria-pressed", String(session.answers[session.index] === index));
      button.classList.toggle("is-selected", session.answers[session.index] === index);
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
    const isMarked = session.markedForReview.has(session.index);
    this.elements.reviewFlag.hidden = !isMarked;
    this.elements.markReviewButton.setAttribute("aria-pressed", String(isMarked));
    this.elements.markReviewButton.textContent = isMarked ? "★ Marked for review" : "☆ Mark for review";
    this.elements.previousButton.disabled = session.index === 0;
    this.elements.nextButton.disabled = session.index === session.questions.length - 1;
    this.elements.nextButton.textContent = session.index === session.questions.length - 1 ? "Last question" : "Next →";
    this.elements.progressLabel.textContent = `Question ${session.index + 1} of ${session.questions.length}`;
    this.elements.answeredLabel.textContent = `${session.answeredCount} answered`;
    this.updateProgress(session.answeredCount);
    this.renderNavigation();
  }

  updateProgress(answered) {
    const total = this.quizSession.questions.length;
    this.elements.progressFill.style.width = `${(answered / total) * 100}%`;
    this.elements.progressBar.setAttribute("aria-valuemax", String(total));
    this.elements.progressBar.setAttribute("aria-valuenow", String(answered));
  }

  renderNavigation() {
    const session = this.quizSession;
    this.elements.questionNavigation.replaceChildren();
    session.questions.forEach((_, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "question-nav-button";
      button.textContent = String(index + 1);
      button.setAttribute("aria-label", `Go to question ${index + 1}${session.answers[index] === null ? ", unanswered" : ", answered"}${session.markedForReview.has(index) ? ", marked for review" : ""}`);
      button.classList.toggle("is-answered", session.answers[index] !== null);
      button.classList.toggle("is-review", session.markedForReview.has(index));
      button.classList.toggle("is-current", index === session.index && !session.isComplete);
      button.setAttribute("aria-current", String(index === session.index && !session.isComplete));
      button.addEventListener("click", () => {
        session.moveTo(index);
        this.render();
      });
      this.elements.questionNavigation.append(button);
    });
  }

  moveQuestion(offset) {
    this.quizSession.moveTo(this.quizSession.index + offset);
    this.render();
  }

  confirmSubmit() {
    const unanswered = this.quizSession.questions.length - this.quizSession.answeredCount;
    const message = unanswered
      ? `You still have ${unanswered} unanswered ${unanswered === 1 ? "question" : "questions"}. Submit your exam anyway?`
      : "Ready to submit your exam and see your results?";
    if (window.confirm(message)) this.submitExam();
  }

  submitExam() {
    if (this.quizSession.isComplete) return;
    this.remainingSeconds = Math.max(0, Math.ceil((this.deadline - Date.now()) / 1000));
    clearInterval(this.timerInterval);
    this.quizSession.isComplete = true;
    this.render();
  }

  renderResults() {
    const session = this.quizSession;
    const total = session.questions.length;
    const score = session.score;
    const percentage = Math.round((score / total) * 100);
    const timeSpent = EXAM_DURATION_SECONDS - this.remainingSeconds;
    this.elements.quizResultTitle.textContent = percentage === 100
      ? "Brilliant work!"
      : percentage >= 67 ? "You’re making great progress." : "Every answer is a chance to learn.";
    this.elements.quizResultCopy.textContent = `${score} of ${total} questions correct, with ${total - session.answeredCount} left unanswered.`;
    this.elements.resultScore.textContent = `${score} / ${total}`;
    this.elements.resultPercentage.textContent = `${percentage}%`;
    this.elements.resultTime.textContent = this.formatDuration(timeSpent);
    this.elements.gradeSummary.textContent =
      `${percentage}% · ${percentage === 100 ? "Mastered" : percentage >= 67 ? "Good progress" : "Keep practising"}`;
    this.renderMissedReview();
    if (!this.historySaved) this.savePracticeHistory();
  }

  renderMissedReview() {
    const session = this.quizSession;
    const missed = session.questions.map((question, index) => ({
      question,
      selectedAnswer: session.answers[index]
    })).filter((item) => item.selectedAnswer !== item.question.correctAnswerIndex);
    this.elements.missedReview.hidden = missed.length === 0;
    this.elements.missedCount.textContent = `${missed.length} to review`;
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

  toggleAnswerReview() {
    const isOpen = this.elements.answerReview.hidden;
    this.elements.answerReview.hidden = !isOpen;
    this.elements.reviewToggle.setAttribute("aria-expanded", String(isOpen));
    this.elements.reviewToggle.textContent = isOpen ? "Hide answer review" : "Review all answers";
    if (isOpen) this.renderAnswerReview();
  }

  renderAnswerReview() {
    this.elements.answerReview.replaceChildren();
    this.quizSession.questions.forEach((question, index) => {
      const item = document.createElement("article");
      item.className = "review-answer-item";
      const heading = document.createElement("h4");
      heading.textContent = `${index + 1}. ${question.question}`;
      const selected = this.quizSession.answers[index];
      const answer = document.createElement("p");
      answer.className = selected === question.correctAnswerIndex ? "review-correct" : "review-incorrect";
      answer.textContent = selected === null
        ? "Your answer: Not answered"
        : `Your answer: ${question.options[selected]}`;
      const correct = document.createElement("p");
      correct.className = "review-correct";
      correct.textContent = `Correct answer: ${question.options[question.correctAnswerIndex]}`;
      const explanation = document.createElement("p");
      explanation.textContent = question.explanation;
      item.append(heading, answer, correct, explanation);
      this.elements.answerReview.append(item);
    });
  }

  retry() {
    this.quizSession.retry();
    this.historySaved = false;
    this.elements.answerReview.hidden = true;
    this.elements.reviewToggle.setAttribute("aria-expanded", "false");
    this.elements.reviewToggle.textContent = "Review all answers";
    this.startTimer();
    this.render();
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
    history.unshift({
      topic: this.elements.topic.textContent || "Practice quiz",
      score: session.score,
      total: session.questions.length,
      missed,
      completedAt: new Date().toISOString()
    });
    localStorage.setItem("little-loop-practice-history", JSON.stringify(history.slice(0, 20)));
    this.historySaved = true;
  }

  formatDuration(seconds) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
  }
}

new CbtPracticePage();
