/* ── CURSOR ── */
const cur = document.getElementById('cursor');
document.addEventListener('mousemove', e => { cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px'; });
document.querySelectorAll('a,button,input,select,.chip,.hlevel').forEach(el => {
    el.addEventListener('mouseenter', () => { cur.style.width = '36px'; cur.style.height = '36px'; cur.style.background = 'rgba(255,58,58,.15)'; });
    el.addEventListener('mouseleave', () => { cur.style.width = '14px'; cur.style.height = '14px'; cur.style.background = 'rgba(255,58,58,.3)'; });
});

/* ── CGPA SLIDER ── */
function updateCGPA(val) {
    const n = parseFloat(val);
    const el = document.getElementById('cgpa-display');
    el.textContent = n.toFixed(1);
    if (n >= 9) el.style.color = 'var(--green)';
    else if (n >= 8) el.style.color = '#88FF44';
    else if (n >= 7) el.style.color = 'var(--yellow)';
    else if (n >= 6) el.style.color = 'var(--orange)';
    else el.style.color = 'var(--red)';
}
updateCGPA(7.5);

/* ── CHIPS ── */
document.querySelectorAll('.chip[data-e]').forEach(c => {
    c.addEventListener('click', () => c.classList.toggle('on'));
});

/* ── HONESTY ── */
document.getElementById('honesty-grid').addEventListener('click', e => {
    const btn = e.target.closest('.hlevel');
    if (!btn) return;
    document.querySelectorAll('.hlevel').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
});

/* ── HELPERS ── */
function v(id) { return (document.getElementById(id)?.value || '').trim(); }
function getCGPA() { return parseFloat(document.getElementById('cgpa-slider').value).toFixed(1); }
function getExtras() { return [...document.querySelectorAll('.chip[data-e].on')].map(c => c.dataset.e); }
function getHonesty() { return document.querySelector('.hlevel.on')?.dataset.h || 'honest'; }

function setThinking(show, msg) {
    if (msg) document.getElementById('thinking-txt').textContent = msg;
    document.getElementById('thinking').classList.toggle('show', show);
    document.getElementById('gen-btn').disabled = show;
    const btn = document.getElementById('gen-btn');
    if (show) { btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Running reality.exe...'; }
    else { btn.innerHTML = '<i class="fa-solid fa-eye"></i> Show Me Reality'; }
}

function getColor(score) {
    if (score >= 75) return 'var(--green)';
    if (score >= 55) return 'var(--yellow)';
    if (score >= 35) return 'var(--orange)';
    return 'var(--red)';
}

/* ── GENERATE ── */
let lastResult = null;

async function generate() {
    const msgs = [
        'Consulting the Indian job market...',
        'Checking CGPA cutoffs...',
        'Analyzing college tier bias...',
        'Talking to imaginary HR managers...',
        'Running reality.exe...',
        'Preparing the truth...'
    ];
    let idx = 0;
    setThinking(true, msgs[0]);
    const interval = setInterval(() => {
        idx = (idx + 1) % msgs.length;
        document.getElementById('thinking-txt').textContent = msgs[idx];
    }, 1400);

    try {
        const payload = {
            cgpa: getCGPA(),
            branch: v('branch'),
            tier: v('college-tier'),
            year: v('year'),
            goal: v('goal'),
            extras: getExtras(),
            honesty: getHonesty()
        };

        const res = await fetch('/api/cgpa', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const raw = await res.text();
        let data;
        try { data = JSON.parse(raw); }
        catch { throw new Error('Server returned invalid response. Check API keys in Vercel.'); }

        if (!res.ok) throw new Error(data?.error || 'Server error ' + res.status);
        lastResult = data;
        renderResult(data);

    } catch (err) {
        showToast('Error: ' + err.message);
    } finally {
        clearInterval(interval);
        setThinking(false);
    }
}

/* ── RENDER ── */
function renderResult(d) {
    const cgpa = getCGPA();
    const verdictColors = { red: 'var(--red)', orange: 'var(--orange)', yellow: 'var(--yellow)', green: 'var(--green)' };
    const vc = verdictColors[d.verdictColor] || 'var(--yellow)';

    const html = `
    <div class="reality-card">

      <div class="rc-header">
        <div>
          <div style="font-family:var(--fm);font-size:.6rem;color:var(--txt3);margin-bottom:.2rem;text-transform:uppercase;letter-spacing:.1em">Your CGPA</div>
          <div class="rc-cgpa-big" style="color:${vc}">${cgpa}</div>
        </div>
        <div class="rc-verdict">
          <div class="rc-verdict-text" style="color:${vc}">${d.verdict || 'REALITY CHECK'}</div>
          <div class="rc-verdict-sub">Overall opportunity score: ${d.overallScore || 0}/100</div>
          <div style="height:6px;background:var(--surface);border-radius:3px;overflow:hidden;border:1px solid var(--border);margin-top:.4rem;width:180px">
            <div style="height:100%;width:${d.overallScore || 0}%;background:${vc};border-radius:3px;transition:width 1s var(--spring)"></div>
          </div>
        </div>
      </div>

      <div class="opp-section">
        <div class="sec-title"><i class="fa-solid fa-chart-column" style="color:var(--blue)"></i> Opportunity Breakdown</div>
        ${(d.opportunityScores || []).map(o => `
          <div class="opp-bar-wrap">
            <div class="opp-bar-top">
              <span class="opp-name">${o.name}</span>
              <span class="opp-score" style="color:${getColor(o.score)}">${o.score}%</span>
            </div>
            <div class="opp-bg">
              <div class="opp-fill" data-w="${o.score}" style="background:${getColor(o.score)}"></div>
            </div>
            ${o.note ? `<div class="opp-note"><i class="fa-solid fa-arrow-right" style="font-size:.5rem;margin-right:.3rem"></i>${o.note}</div>` : ''}
          </div>
        `).join('')}
      </div>

      <div class="doors-section">
        <div class="sec-title"><i class="fa-solid fa-door-open" style="color:var(--green)"></i> Doors Open &amp; Closed</div>
        <div class="doors-grid">
          <div class="door-card open">
            <div class="door-title"><i class="fa-solid fa-circle-check"></i> Open For You</div>
            ${(d.openDoors || []).map(item => `
              <div class="door-item">
                <i class="fa-solid fa-check" style="color:var(--green)"></i>${item}
              </div>`).join('')}
          </div>
          <div class="door-card closed">
            <div class="door-title"><i class="fa-solid fa-circle-xmark"></i> Currently Closed</div>
            ${(d.closedDoors || []).map(item => `
              <div class="door-item">
                <i class="fa-solid fa-xmark" style="color:var(--red)"></i>${item}
              </div>`).join('')}
          </div>
        </div>
      </div>

      <div class="brutal-section">
        <div class="sec-title"><i class="fa-solid fa-fire" style="color:var(--red)"></i> The Brutal Truth</div>
        <div class="brutal-text">${d.brutalTruth || ''}</div>
      </div>

      <div class="action-section">
        <div class="sec-title"><i class="fa-solid fa-rocket" style="color:var(--green)"></i> Your Action Plan</div>
        ${(d.actionPlan || []).map((item, i) => `
          <div class="action-item">
            <div class="action-num">${i + 1}</div>
            <div class="action-text">${item}</div>
          </div>`).join('')}
      </div>

      ${(d.famousExamples || []).length ? `
      <div class="examples-section">
        <div class="sec-title"><i class="fa-solid fa-lightbulb" style="color:var(--yellow)"></i> Remember This</div>
        ${d.famousExamples.map(ex => `
          <div class="example-card">
            <div class="ex-icon"><i class="fa-solid fa-star"></i></div>
            <div class="ex-text"><span class="ex-name">${ex.name}:</span> ${ex.story}</div>
          </div>`).join('')}
      </div>` : ''}

    </div>

    <div class="share-row">
      <button class="share-btn" onclick="copyResult()"><i class="fa-solid fa-copy"></i> Copy Result</button>
      <button class="share-btn" onclick="generate()"><i class="fa-solid fa-rotate"></i> Regenerate</button>
      <button class="share-btn primary" onclick="shareLinkedIn()"><i class="fa-brands fa-linkedin"></i> Share on LinkedIn</button>
    </div>`;

    document.getElementById('output-panel').innerHTML = html;

    // Animate bars
    setTimeout(() => {
        document.querySelectorAll('.opp-fill[data-w]').forEach(el => {
            el.style.width = el.dataset.w + '%';
        });
    }, 120);
}

/* ── COPY ── */
function copyResult() {
    if (!lastResult) return;
    const d = lastResult;
    const cgpa = getCGPA();
    const text = `CGPA Reality Check: ${cgpa}/10\n\nVerdict: ${d.verdict}\n\n${d.brutalTruth}\n\nAction Plan:\n${(d.actionPlan || []).map((a, i) => `${i + 1}. ${a}`).join('\n')}\n\nGenerated by CGPA.exe — instai4.github.io`;
    navigator.clipboard.writeText(text).then(() => showToast('Result copied!'));
}

/* ── SHARE ── */
function shareLinkedIn() {
    if (!lastResult) return;
    const d = lastResult;
    const cgpa = getCGPA();
    const text = `I just ran my CGPA through CGPA.exe — a brutally honest reality check for Indian students.\n\nCGPA: ${cgpa}/10 — Verdict: ${d.verdict}\n\n${d.brutalTruth?.slice(0, 200)}...\n\nEvery CS/DS student in India needs to see this. No sugarcoating, just facts.\n\n#StudentLife #DataScience #CareerAdvice #IndianJobMarket #CGPA #PlacementSeason`;
    window.open(`https://www.linkedin.com/sharing/share-offsite/?text=${encodeURIComponent(text)}`, '_blank');
}

/* ── TOAST ── */
function showToast(msg) {
    const t = document.getElementById('toast');
    document.getElementById('toast-txt').textContent = msg;
    t.classList.add('on');
    setTimeout(() => t.classList.remove('on'), 3000);
}
