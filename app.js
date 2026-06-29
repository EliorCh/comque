// ============================================================
// אפליקציית תרגול למבחן · מבוא לתקשורת מחשבים (141418)
// ============================================================

const STORAGE_KEY = 'cc141418_state';

const TOPIC_TAG_CLASS = {
  application: 'app',
  transport: 'trans',
  network: 'net',
  link: 'link',
  security: 'sec',
  general: 'gen'
};

// ============================================================
// State management
// ============================================================

const State = {
  load() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : { history: [], marked: [] };
    } catch (e) {
      return { history: [], marked: [] };
    }
  },

  save(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Could not save to localStorage', e);
    }
  },

  addExamResult(result) {
    const state = this.load();
    state.history.unshift({
      date: Date.now(),
      score: result.score,
      total: result.total,
      correct: result.correct,
      wrongIds: result.wrongIds,
      byTopic: result.byTopic
    });
    if (state.history.length > 50) state.history = state.history.slice(0, 50);
    this.save(state);
  },

  toggleMarked(questionId) {
    const state = this.load();
    const idx = state.marked.indexOf(questionId);
    if (idx >= 0) state.marked.splice(idx, 1);
    else state.marked.push(questionId);
    this.save(state);
    return state.marked.includes(questionId);
  },

  isMarked(questionId) {
    return this.load().marked.includes(questionId);
  }
};

// ============================================================
// Exam session
// ============================================================

const Exam = {
  session: null,
  timerInterval: null,

  start() {
    // pick 20 random questions, weighted toward different topics
    const byTopic = {};
    QUESTIONS.forEach(q => {
      if (!byTopic[q.topic]) byTopic[q.topic] = [];
      byTopic[q.topic].push(q);
    });

    const selected = [];
    // shuffle each topic's questions
    Object.values(byTopic).forEach(arr => shuffle(arr));

    // distribute 20 questions across topics
    const topics = Object.keys(byTopic);
    const perTopic = Math.floor(20 / topics.length);
    const remainder = 20 - perTopic * topics.length;

    topics.forEach((topic, i) => {
      const count = perTopic + (i < remainder ? 1 : 0);
      selected.push(...byTopic[topic].slice(0, count));
    });

    // fill up if we don't have enough
    if (selected.length < 20) {
      const allShuffled = shuffle([...QUESTIONS]);
      for (const q of allShuffled) {
        if (selected.length >= 20) break;
        if (!selected.includes(q)) selected.push(q);
      }
    }

    shuffle(selected);
    this.session = {
      questions: selected.slice(0, 20),
      answers: new Array(20).fill(null),
      flagged: new Set(),
      currentIdx: 0,
      startTime: Date.now(),
      duration: 90 * 60 * 1000, // 90 min
    };

    this.show();
    this.startTimer();
  },

  show() {
    showView('exam');
    this.renderNav();
    this.renderQuestion();
  },

  startTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.updateTimer();
    }, 1000);
    this.updateTimer();
  },

  updateTimer() {
    if (!this.session) return;
    const elapsed = Date.now() - this.session.startTime;
    const remaining = this.session.duration - elapsed;
    const timerEl = document.getElementById('exam-timer');

    if (remaining <= 0) {
      timerEl.textContent = '00:00';
      timerEl.classList.add('critical');
      this.submit(true);
      return;
    }

    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    timerEl.textContent = `${pad(mins)}:${pad(secs)}`;

    if (remaining < 5 * 60 * 1000) {
      timerEl.classList.remove('warning');
      timerEl.classList.add('critical');
    } else if (remaining < 15 * 60 * 1000) {
      timerEl.classList.add('warning');
      timerEl.classList.remove('critical');
    }
  },

  renderNav() {
    const nav = document.getElementById('exam-nav');
    nav.innerHTML = `
      <div class="exam-nav-title">ניווט בין שאלות</div>
      <div class="exam-nav-grid">
        ${this.session.questions.map((q, i) => `
          <button class="q-nav-btn ${this.session.answers[i] !== null ? 'answered' : ''} ${i === this.session.currentIdx ? 'current' : ''} ${this.session.flagged.has(i) ? 'flagged' : ''}" data-idx="${i}">
            ${i + 1}
          </button>
        `).join('')}
      </div>
      <div class="exam-nav-legend">
        <div class="legend-row"><div class="legend-dot answered"></div>נענתה</div>
        <div class="legend-row"><div class="legend-dot current"></div>נוכחית</div>
        <div class="legend-row"><div class="legend-dot"></div>טרם נענתה</div>
      </div>
    `;
    nav.querySelectorAll('.q-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.session.currentIdx = parseInt(btn.dataset.idx);
        this.renderNav();
        this.renderQuestion();
      });
    });
  },

  renderQuestion() {
    const q = this.session.questions[this.session.currentIdx];
    const selected = this.session.answers[this.session.currentIdx];
    const isFlagged = this.session.flagged.has(this.session.currentIdx);

    document.getElementById('exam-progress').innerHTML =
      `שאלה <span class="ltr">${this.session.currentIdx + 1}</span> / <span class="ltr">20</span>`;

    document.getElementById('exam-question').innerHTML = `
      <div class="question-card">
        <div class="question-header">
          <div>
            <span class="question-number">שאלה <span class="ltr">${this.session.currentIdx + 1}</span> · <span class="ltr">5</span> נקודות</span>
          </div>
          <button class="question-flag ${isFlagged ? 'active' : ''}" data-action="flag">
            ${isFlagged ? '★ מסומנת' : '☆ סמן לחזרה'}
          </button>
        </div>
        <span class="topic-tag ${TOPIC_TAG_CLASS[q.topic]}">${TOPIC_NAMES[q.topic]} · ${q.subtopic}</span>
        <div class="question-text">${renderText(q.question)}</div>
        <div class="options-list">
          ${q.options.map((opt, i) => `
            <button class="option-item ${selected === i ? 'selected' : ''}" data-option="${i}">
              <span class="option-letter">${'אבגדה'[i]}.</span>
              <span class="option-text">${renderText(opt)}</span>
            </button>
          `).join('')}
        </div>
        <div class="question-footer">
          <button class="btn-secondary" data-action="prev" ${this.session.currentIdx === 0 ? 'disabled' : ''}>
            → קודמת
          </button>
          <span class="question-source">מקור: ${q.source}</span>
          <button class="btn-secondary" data-action="next" ${this.session.currentIdx === 19 ? 'disabled' : ''}>
            הבאה ←
          </button>
        </div>
      </div>
    `;

    // attach handlers
    document.querySelectorAll('.option-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.option);
        this.session.answers[this.session.currentIdx] = idx;
        this.renderNav();
        this.renderQuestion();
      });
    });

    document.querySelector('[data-action="flag"]')?.addEventListener('click', () => {
      if (this.session.flagged.has(this.session.currentIdx)) {
        this.session.flagged.delete(this.session.currentIdx);
      } else {
        this.session.flagged.add(this.session.currentIdx);
      }
      this.renderNav();
      this.renderQuestion();
    });

    document.querySelector('[data-action="prev"]')?.addEventListener('click', () => {
      if (this.session.currentIdx > 0) {
        this.session.currentIdx--;
        this.renderNav();
        this.renderQuestion();
      }
    });

    document.querySelector('[data-action="next"]')?.addEventListener('click', () => {
      if (this.session.currentIdx < 19) {
        this.session.currentIdx++;
        this.renderNav();
        this.renderQuestion();
      }
    });

    renderMath();
  },

  submit(timeUp = false) {
    if (!timeUp) {
      const unanswered = this.session.answers.filter(a => a === null).length;
      if (unanswered > 0) {
        if (!confirm(`יש ${unanswered} שאלות לא ענויות. להמשיך עם הסיום?`)) return;
      }
    }

    clearInterval(this.timerInterval);

    // calculate results
    let correct = 0;
    const wrongIds = [];
    const byTopic = {};

    this.session.questions.forEach((q, i) => {
      if (!byTopic[q.topic]) byTopic[q.topic] = { correct: 0, total: 0 };
      byTopic[q.topic].total++;
      if (this.session.answers[i] === q.correctIndex) {
        correct++;
        byTopic[q.topic].correct++;
      } else {
        wrongIds.push(q.id);
      }
    });

    const score = correct * 5;
    const result = { score, total: 100, correct, wrongIds, byTopic, questions: this.session.questions, answers: this.session.answers };

    State.addExamResult(result);
    this.showResults(result);
    this.session = null;
  },

  showResults(result) {
    showView('results');
    const container = document.getElementById('results-container');

    let scoreClass = 'fail';
    let summaryText = 'יש לעבוד יותר. נסה תרגול לפי נושא.';
    if (result.score >= 90) { scoreClass = 'pass'; summaryText = 'מצוין! אתה מוכן למבחן.'; }
    else if (result.score >= 75) { scoreClass = 'pass'; summaryText = 'יפה מאוד. חזור על השאלות שטעית בהן.'; }
    else if (result.score >= 60) { scoreClass = 'average'; summaryText = 'עברת! אך יש מקום לשיפור.'; }

    container.innerHTML = `
      <div class="results-header">
        <div class="results-title">ציון סופי</div>
        <div class="results-score ${scoreClass}">${result.score}</div>
        <div class="results-summary">${summaryText}</div>
      </div>

      <div class="results-stats">
        <div class="results-stat">
          <div class="results-stat-value">${result.correct}/20</div>
          <div class="results-stat-label">תשובות נכונות</div>
        </div>
        <div class="results-stat">
          <div class="results-stat-value">${20 - result.correct}</div>
          <div class="results-stat-label">טעויות</div>
        </div>
        <div class="results-stat">
          <div class="results-stat-value">${result.wrongIds.length === 0 ? '✓' : Math.round(result.correct / 20 * 100) + '%'}</div>
          <div class="results-stat-label">אחוז הצלחה</div>
        </div>
      </div>

      <div class="results-by-topic">
        <h3>פילוח לפי נושא</h3>
        ${Object.entries(result.byTopic).map(([topic, data]) => {
          const pct = data.total > 0 ? (data.correct / data.total * 100) : 0;
          return `
            <div class="topic-result">
              <div class="topic-result-name" style="color: ${TOPIC_COLORS[topic]}">${TOPIC_NAMES[topic]}</div>
              <div class="topic-result-bar">
                <div class="topic-result-bar-fill" style="width: ${pct}%; background: ${TOPIC_COLORS[topic]}"></div>
              </div>
              <div class="topic-result-score">${data.correct}/${data.total}</div>
            </div>
          `;
        }).join('')}
      </div>

      <div class="results-actions">
        <button class="btn-primary" data-action="restart-exam">מבחן חדש</button>
        <button class="btn-secondary" data-action="back-home">חזרה לדף הבית</button>
      </div>

      <h2 class="results-review-title">סקירת השאלות</h2>
      ${result.questions.map((q, i) => {
        const userAns = result.answers[i];
        const isCorrect = userAns === q.correctIndex;
        const isUnanswered = userAns === null;
        const status = isUnanswered ? 'unanswered' : (isCorrect ? 'correct' : 'incorrect');
        const statusText = isUnanswered ? 'לא נענתה' : (isCorrect ? '✓ נכון' : '✗ טעות');

        return `
          <details class="review-question ${status}">
            <summary class="review-q-header">
              <span class="review-q-num">שאלה ${i + 1} · ${TOPIC_NAMES[q.topic]}</span>
              <span class="review-q-status ${status}">${statusText}</span>
            </summary>
            <div style="margin-top: 12px;">
              <div class="review-q-text">${renderText(q.question)}</div>
              <div class="options-list" style="margin-top: 16px;">
                ${q.options.map((opt, oi) => {
                  let cls = '';
                  if (oi === q.correctIndex) cls = 'correct';
                  else if (oi === userAns && oi !== q.correctIndex) cls = 'incorrect';
                  return `
                    <div class="option-item ${cls}" style="cursor: default;">
                      <span class="option-letter">${'אבגדה'[oi]}.</span>
                      <span class="option-text">${renderText(opt)}</span>
                    </div>
                  `;
                }).join('')}
              </div>
              <div class="explanation">
                <div class="explanation-label">הסבר</div>
                <div class="explanation-body">${renderText(q.explanation)}</div>
              </div>
            </div>
          </details>
        `;
      }).join('')}
    `;

    renderMath();
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  exit() {
    if (this.session && confirm('האם לצאת מהמבחן? התשובות לא יישמרו.')) {
      clearInterval(this.timerInterval);
      this.session = null;
      showView('home');
      renderHome();
    }
  }
};

// ============================================================
// Practice mode
// ============================================================

const Practice = {
  filters: { topics: new Set() },

  show() {
    showView('practice');
    this.renderFilters();
    this.renderQuestions();
  },

  renderFilters() {
    const container = document.getElementById('topic-filters');
    const topics = Object.keys(TOPIC_NAMES);
    container.innerHTML = topics.map(topic => `
      <button class="filter-chip ${this.filters.topics.has(topic) ? 'active' : ''}" 
              data-topic="${topic}"
              style="--chip-color: ${TOPIC_COLORS[topic]}">
        ${TOPIC_NAMES[topic]}
      </button>
    `).join('');

    container.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const topic = chip.dataset.topic;
        if (this.filters.topics.has(topic)) this.filters.topics.delete(topic);
        else this.filters.topics.add(topic);
        this.renderFilters();
        this.renderQuestions();
      });
    });
  },

  getFiltered() {
    if (this.filters.topics.size === 0) return QUESTIONS;
    return QUESTIONS.filter(q => this.filters.topics.has(q.topic));
  },

  renderQuestions() {
    const filtered = this.getFiltered();
    document.getElementById('filter-summary').textContent = `${filtered.length} שאלות`;

    const container = document.getElementById('practice-questions');
    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">⌕</div>
          <h3>אין שאלות תואמות</h3>
          <p>נסה לבחור נושא אחר</p>
        </div>`;
      return;
    }

    container.innerHTML = filtered.map((q, i) => this.renderPracticeQuestion(q, i)).join('');

    container.querySelectorAll('.option-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const qId = parseInt(btn.closest('[data-qid]').dataset.qid);
        const oIdx = parseInt(btn.dataset.option);
        const card = btn.closest('.practice-question');

        // disable all options
        card.querySelectorAll('.option-item').forEach((opt, i) => {
          opt.disabled = true;
          const q = QUESTIONS.find(qq => qq.id === qId);
          if (i === q.correctIndex) opt.classList.add('correct');
          else if (i === oIdx && i !== q.correctIndex) opt.classList.add('incorrect');
        });

        // show explanation
        const expBlock = card.querySelector('.explanation');
        if (expBlock) expBlock.style.display = 'block';

        renderMath();
      });
    });

    container.querySelectorAll('[data-action="flag"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const qId = parseInt(btn.dataset.qid);
        const nowMarked = State.toggleMarked(qId);
        btn.classList.toggle('active', nowMarked);
        btn.textContent = nowMarked ? '★ מסומנת' : '☆ סמן לחזרה';
        showToast(nowMarked ? 'השאלה סומנה' : 'הסימון הוסר');
      });
    });

    renderMath();
  },

  renderPracticeQuestion(q, idx) {
    const isMarked = State.isMarked(q.id);
    return `
      <div class="practice-question" data-qid="${q.id}">
        <div class="practice-q-header">
          <div class="practice-q-meta">
            <span class="topic-tag ${TOPIC_TAG_CLASS[q.topic]}">${TOPIC_NAMES[q.topic]} · ${q.subtopic}</span>
            <span>מקור: ${q.source}</span>
          </div>
          <button class="question-flag ${isMarked ? 'active' : ''}" data-action="flag" data-qid="${q.id}">
            ${isMarked ? '★ מסומנת' : '☆ סמן לחזרה'}
          </button>
        </div>
        <div class="question-text">${renderText(q.question)}</div>
        <div class="options-list">
          ${q.options.map((opt, i) => `
            <button class="option-item" data-option="${i}">
              <span class="option-letter">${'אבגדה'[i]}.</span>
              <span class="option-text">${renderText(opt)}</span>
            </button>
          `).join('')}
        </div>
        <div class="explanation" style="display: none;">
          <div class="explanation-label">הסבר · התשובה הנכונה: ${'אבגדה'[q.correctIndex]}</div>
          <div class="explanation-body">${renderText(q.explanation)}</div>
        </div>
      </div>
    `;
  }
};

// ============================================================
// Browse view
// ============================================================

const Browse = {
  show() {
    showView('browse');
    const container = document.getElementById('browse-content');

    // group by source
    const bySource = {};
    QUESTIONS.forEach(q => {
      if (!bySource[q.source]) bySource[q.source] = [];
      bySource[q.source].push(q);
    });

    container.innerHTML = Object.entries(bySource).map(([source, qs]) => `
      <h2 style="font-size: 20px; font-weight: 700; margin-top: 32px; margin-bottom: 16px; color: var(--ink); padding-right: 8px;">${source} <span style="color: var(--ink-muted); font-weight: 400; font-size: 14px;">· ${qs.length} שאלות</span></h2>
      ${qs.map(q => `
        <details class="practice-question" data-qid="${q.id}" style="padding: 20px 24px;">
          <summary style="cursor: pointer; display: flex; gap: 16px; align-items: flex-start; list-style: none;">
            <span class="topic-tag ${TOPIC_TAG_CLASS[q.topic]}" style="flex-shrink: 0;">${q.subtopic}</span>
            <span style="flex: 1; font-weight: 500;">${renderText(q.question)}</span>
          </summary>
          <div style="margin-top: 16px;">
            <div class="options-list">
              ${q.options.map((opt, i) => `
                <div class="option-item ${i === q.correctIndex ? 'correct' : ''}" style="cursor: default;">
                  <span class="option-letter">${'אבגדה'[i]}.</span>
                  <span class="option-text">${renderText(opt)}</span>
                </div>
              `).join('')}
            </div>
            <div class="explanation">
              <div class="explanation-label">הסבר · התשובה הנכונה: ${'אבגדה'[q.correctIndex]}</div>
              <div class="explanation-body">${renderText(q.explanation)}</div>
            </div>
          </div>
        </details>
      `).join('')}
    `).join('');

    renderMath();
  }
};

// ============================================================
// Marked questions view
// ============================================================

const Marked = {
  show() {
    showView('marked');
    const state = State.load();
    const markedQs = QUESTIONS.filter(q => state.marked.includes(q.id));

    // also get questions user got wrong recently
    const wrongIds = new Set();
    state.history.slice(0, 5).forEach(h => h.wrongIds?.forEach(id => wrongIds.add(id)));
    const wrongQs = QUESTIONS.filter(q => wrongIds.has(q.id) && !state.marked.includes(q.id));

    const container = document.getElementById('marked-content');

    if (markedQs.length === 0 && wrongQs.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">★</div>
          <h3>אין שאלות מסומנות</h3>
          <p>במצב תרגול לפי נושא, סמן שאלות בכוכב כדי שיופיעו כאן.</p>
        </div>`;
      return;
    }

    let html = '';
    if (markedQs.length > 0) {
      html += `<h2 style="font-size: 20px; font-weight: 700; margin-bottom: 16px;">שאלות שסימנת (${markedQs.length})</h2>`;
      html += markedQs.map(q => Practice.renderPracticeQuestion(q, 0)).join('');
    }
    if (wrongQs.length > 0) {
      html += `<h2 style="font-size: 20px; font-weight: 700; margin-top: 32px; margin-bottom: 16px;">טעויות אחרונות (${wrongQs.length})</h2>`;
      html += wrongQs.map(q => Practice.renderPracticeQuestion(q, 0)).join('');
    }
    container.innerHTML = html;

    // attach handlers (same as Practice)
    container.querySelectorAll('.option-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const qId = parseInt(btn.closest('[data-qid]').dataset.qid);
        const oIdx = parseInt(btn.dataset.option);
        const card = btn.closest('.practice-question');
        card.querySelectorAll('.option-item').forEach((opt, i) => {
          opt.disabled = true;
          const q = QUESTIONS.find(qq => qq.id === qId);
          if (i === q.correctIndex) opt.classList.add('correct');
          else if (i === oIdx && i !== q.correctIndex) opt.classList.add('incorrect');
        });
        const expBlock = card.querySelector('.explanation');
        if (expBlock) expBlock.style.display = 'block';
        renderMath();
      });
    });

    container.querySelectorAll('[data-action="flag"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const qId = parseInt(btn.dataset.qid);
        const nowMarked = State.toggleMarked(qId);
        btn.classList.toggle('active', nowMarked);
        btn.textContent = nowMarked ? '★ מסומנת' : '☆ סמן לחזרה';
        if (!nowMarked) {
          setTimeout(() => Marked.show(), 200); // refresh list
        }
      });
    });

    renderMath();
  }
};

// ============================================================
// Utilities
// ============================================================

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pad(n) { return String(n).padStart(2, '0'); }

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById('view-' + name).classList.remove('hidden');
  window.scrollTo(0, 0);
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.add('hidden'), 2000);
}

// Wrap English/numerical fragments in spans so RTL bidi behaves
function renderText(text) {
  if (!text) return '';
  // escape HTML
  text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // wrap LTR sequences in span.ltr.
  // A sequence may start with an opening bracket followed by a letter/digit,
  // or directly with a letter/digit. It can continue with letters/digits and
  // internal punctuation (including semicolons for HTML entities like &amp;).
  text = text.replace(
    /([\(\[\{]?[A-Za-z0-9][A-Za-z0-9_\-+=:;/\\.,()\[\]{}@#$%^&*'"`~?!]*(?:[ ]+[\(\[\{]?[A-Za-z0-9][A-Za-z0-9_\-+=:;/\\.,()\[\]{}@#$%^&*'"`~?!]*)*)/g,
    m => `<span class="ltr">${m}</span>`
  );
  // line breaks
  text = text.replace(/\n/g, '<br>');
  return text;
}

function renderMath() {
  if (typeof renderMathInElement === 'function') {
    document.querySelectorAll('.question-text, .option-text, .explanation-body').forEach(el => {
      try { renderMathInElement(el, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false }
        ],
        throwOnError: false
      }); } catch (e) {}
    });
  }
}

// ============================================================
// Home rendering
// ============================================================

function renderHome() {
  const state = State.load();
  const statsEl = document.getElementById('hero-stats');

  let bestScore = state.history.length > 0 ? Math.max(...state.history.map(h => h.score)) : null;
  let attempts = state.history.length;
  let marked = state.marked.length;

  statsEl.innerHTML = `
    <div class="hero-stat">
      <div class="hero-stat-value">${QUESTIONS.length}</div>
      <div class="hero-stat-label">שאלות במאגר</div>
    </div>
    <div class="hero-stat">
      <div class="hero-stat-value">${attempts}</div>
      <div class="hero-stat-label">מבחנים שעברת</div>
    </div>
    <div class="hero-stat">
      <div class="hero-stat-value">${bestScore !== null ? bestScore : '–'}</div>
      <div class="hero-stat-label">הציון הגבוה</div>
    </div>
    <div class="hero-stat">
      <div class="hero-stat-value">${marked}</div>
      <div class="hero-stat-label">שאלות מסומנות</div>
    </div>
  `;
}

// ============================================================
// Event delegation
// ============================================================

document.addEventListener('click', (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (!action) return;

  switch (action) {
    case 'start-exam':
    case 'restart-exam':
      Exam.start();
      break;
    case 'submit-exam':
      Exam.submit();
      break;
    case 'exit-exam':
      Exam.exit();
      break;
    case 'open-practice':
      Practice.show();
      break;
    case 'open-browse':
      Browse.show();
      break;
    case 'open-marked':
      Marked.show();
      break;
    case 'back-home':
      showView('home');
      renderHome();
      break;
  }
});

// Init
window.addEventListener('DOMContentLoaded', () => {
  renderHome();
});
