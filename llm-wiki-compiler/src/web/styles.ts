/**
 * Shared static asset content for the llmwiki static HTML wiki.
 *
 * Exports the CSS stylesheet and the client-side render script as plain
 * strings that the builder writes to wiki/web/assets/. Keeping styles in
 * a separate module lets templates.ts stay within the 400-line limit and
 * makes the design easy to update independently.
 *
 * Design language:
 *   - Dark navy sidebar (#0f172a) — professional IDE feel
 *   - Warm off-white main area (#f9f8f5) — not stark white
 *   - Inter (Google Fonts) for UI; JetBrains Mono for code
 *   - Indigo accent (#6366f1) with soft purple tones
 *   - Concept cards: white surface, subtle shadow, lift on hover
 */

/** Full CSS stylesheet for the static wiki. */
export function cssContent(): string {
  return `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

:root {
  --sidebar-w: 272px;
  --header-h: 56px;
  --navy-950: #07090f;
  --navy-900: #0f172a;
  --navy-800: #1e293b;
  --navy-700: #334155;
  --slate-400: #94a3b8;
  --slate-300: #cbd5e1;
  --indigo-500: #6366f1;
  --indigo-400: #818cf8;
  --indigo-950: #1e1b4b;
  --bg: #f9f8f5;
  --surface: #ffffff;
  --border: #e8e4dc;
  --text: #0f172a;
  --muted: #64748b;
  --accent: #6366f1;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --shadow-sm: 0 1px 3px 0 rgb(0 0 0/.08),0 1px 2px -1px rgb(0 0 0/.05);
  --shadow-md: 0 4px 12px -2px rgb(0 0 0/.12),0 2px 6px -2px rgb(0 0 0/.06);
}

*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',system-ui,sans-serif;font-size:15px;line-height:1.6;color:var(--text);background:var(--bg);-webkit-font-smoothing:antialiased}

/* ── Header ─────────────────────────────────────────────── */
header{height:var(--header-h);display:flex;align-items:center;padding:0 1.5rem;background:var(--navy-900);position:sticky;top:0;z-index:100;gap:1rem;border-bottom:1px solid var(--navy-800)}
.logo{font-size:1.05rem;font-weight:700;letter-spacing:-0.03em;color:#fff;text-decoration:none}
.logo span{color:var(--indigo-400)}
#search{margin-left:auto;padding:.38rem 1rem;background:var(--navy-800);border:1px solid var(--navy-700);border-radius:999px;color:var(--slate-300);font-size:.8rem;font-family:inherit;width:200px;outline:none;transition:border-color .15s,background .15s}
#search::placeholder{color:var(--slate-400)}
#search:focus{border-color:var(--indigo-500);background:var(--navy-950)}

/* ── Layout ──────────────────────────────────────────────── */
.layout{display:flex;height:calc(100vh - var(--header-h));overflow:hidden}

/* ── Sidebar ─────────────────────────────────────────────── */
.sidebar{width:var(--sidebar-w);background:var(--navy-900);border-right:1px solid var(--navy-800);overflow-y:auto;flex-shrink:0;padding:1.25rem 0 2rem;scrollbar-width:thin;scrollbar-color:var(--navy-700) transparent}
.sidebar details{}
.sidebar summary{list-style:none;display:flex;align-items:center;gap:.45rem;padding:.45rem 1rem;font-size:.68rem;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:var(--slate-400);cursor:pointer;user-select:none;transition:color .15s}
.sidebar summary::-webkit-details-marker{display:none}
.sidebar summary::before{content:'';display:inline-block;width:0;height:0;border-style:solid;border-width:4px 0 4px 6px;border-color:transparent transparent transparent var(--slate-400);transition:transform .18s;flex-shrink:0;opacity:.7}
.sidebar details[open]>summary::before{transform:rotate(90deg)}
.sidebar summary:hover{color:var(--slate-300)}
.sidebar ul{list-style:none;padding:0;margin-bottom:.25rem}
.sidebar a{display:block;padding:.35rem 1rem .35rem 2rem;font-size:.84rem;font-weight:400;color:var(--slate-400);text-decoration:none;border-radius:var(--radius-sm);margin:.1rem .5rem;transition:color .13s,background .13s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sidebar a:hover{color:var(--slate-300);background:var(--navy-800)}
.sidebar a.active{color:var(--indigo-400);background:var(--indigo-950);font-weight:500}
.sidebar details details summary{padding-left:1.5rem}
.sidebar details details a{padding-left:2.75rem}
.sidebar details details details summary{padding-left:2.5rem}
.sidebar details details details a{padding-left:3.5rem}

/* ── Main ────────────────────────────────────────────────── */
main{flex:1;overflow-y:auto;background:var(--bg)}
.content-wrap{max-width:780px;padding:2.5rem 3rem;margin:0 auto}

/* ── Breadcrumbs ─────────────────────────────────────────── */
.breadcrumbs{display:flex;align-items:center;flex-wrap:wrap;gap:.2rem;font-size:.775rem;color:var(--muted);margin-bottom:2rem}
.breadcrumbs a{color:var(--muted);text-decoration:none;transition:color .13s}
.breadcrumbs a:hover{color:var(--accent)}
.breadcrumbs .sep{color:var(--border);font-size:.7rem;margin:0 .1rem}

/* ── Content typography ──────────────────────────────────── */
#content h1{font-size:1.875rem;font-weight:700;letter-spacing:-.025em;line-height:1.2;color:var(--text);margin-bottom:.75rem}
#content h2{font-size:1.2rem;font-weight:600;letter-spacing:-.015em;color:var(--text);margin:2rem 0 .75rem;padding-bottom:.5rem;border-bottom:1px solid var(--border)}
#content h3{font-size:1.025rem;font-weight:600;color:var(--text);margin:1.5rem 0 .45rem}
#content h4{font-size:.875rem;font-weight:600;color:var(--muted);margin:1.25rem 0 .4rem;text-transform:uppercase;letter-spacing:.06em}
#content p{color:#374151;line-height:1.8;margin-bottom:1rem}
#content a{color:var(--accent);text-decoration:underline;text-decoration-color:#c7d2fe;text-underline-offset:2px;transition:text-decoration-color .13s}
#content a:hover{text-decoration-color:var(--accent)}
#content strong{font-weight:600;color:var(--text)}
#content em{font-style:italic;color:#4b5563}
#content code{font-family:'JetBrains Mono','Fira Code',monospace;font-size:.84em;background:#f1f0ed;border:1px solid #e2dfd7;padding:.15em .4em;border-radius:4px;color:#be185d}
#content pre{background:#0d1117;border-radius:var(--radius-md);padding:1.25rem 1.5rem;overflow-x:auto;margin-bottom:1.25rem;border:1px solid #21262d;box-shadow:var(--shadow-sm)}
#content pre code{background:none;border:none;padding:0;color:#e6edf3;font-size:.875rem;line-height:1.65}
#content blockquote{border-left:3px solid var(--indigo-500);padding:.75rem 1.25rem;background:#f5f3ff;border-radius:0 var(--radius-sm) var(--radius-sm) 0;margin-bottom:1.25rem;color:#4338ca}
#content blockquote p{color:#4338ca;margin:0}
#content ul,#content ol{padding-left:1.5rem;margin-bottom:1rem}
#content li{line-height:1.8;margin-bottom:.3rem;color:#374151}
#content hr{border:none;border-top:1px solid var(--border);margin:2rem 0}
#content table{width:100%;border-collapse:collapse;margin-bottom:1.25rem;font-size:.9rem}
#content th{background:var(--bg);padding:.6rem .875rem;text-align:left;font-weight:600;border-bottom:2px solid var(--border)}
#content td{padding:.6rem .875rem;border-bottom:1px solid var(--border)}
#content tr:last-child td{border-bottom:none}
#content sup{font-size:.75em;color:var(--muted)}

/* ── Index page ──────────────────────────────────────────── */
.page-header{margin-bottom:2.5rem}
.page-title{font-size:2rem;font-weight:700;letter-spacing:-.03em;color:var(--text);margin-bottom:.35rem}
.page-subtitle{font-size:.925rem;color:var(--muted)}

.category-section{margin-bottom:2.75rem}
.category-label{font-size:.7rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:.875rem;display:flex;align-items:center;gap:.75rem}
.category-label::after{content:'';flex:1;height:1px;background:var(--border)}
.subcategory-label{font-size:.7rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;margin:1.25rem 0 .6rem .125rem}

.concept-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:.75rem;margin-bottom:1rem}
.concept-card{display:block;padding:1rem 1.125rem;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);text-decoration:none;color:inherit;transition:border-color .15s,box-shadow .15s,transform .12s;box-shadow:var(--shadow-sm)}
.concept-card:hover{border-color:var(--accent);box-shadow:var(--shadow-md);transform:translateY(-2px)}
.card-title{font-size:.875rem;font-weight:600;color:var(--accent);margin-bottom:.3rem;letter-spacing:-.01em}
.card-summary{font-size:.79rem;color:var(--muted);line-height:1.5}

/* ── Header action links ─────────────────────────────────── */
.header-actions{display:flex;align-items:center;gap:.5rem;margin-left:.5rem}
.header-action{font-size:.8rem;font-weight:500;color:var(--slate-400);text-decoration:none;padding:.25rem .65rem;border-radius:var(--radius-sm);border:1px solid var(--navy-700);transition:color .13s,background .13s,border-color .13s}
.header-action:hover{color:var(--slate-300);background:var(--navy-800);border-color:var(--slate-400)}
.header-action.active{color:var(--indigo-400);border-color:var(--indigo-500);background:var(--indigo-950)}
.header-action.disabled{color:var(--navy-700);border-color:var(--navy-800);cursor:default;pointer-events:none}

/* ── Log page ────────────────────────────────────────────── */
.log-page .content-wrap{max-width:1100px}
.log-table{width:100%;border-collapse:collapse;font-size:.8rem;margin-top:1.25rem}
.log-table th{background:var(--bg);padding:.5rem .75rem;text-align:left;font-weight:600;border-bottom:2px solid var(--border);color:var(--muted);font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;user-select:none}
.log-table th[data-col]{cursor:pointer}
.log-table th[data-col]:hover{color:var(--text)}
.log-table th[data-sort="asc"]::after{content:' ▲';opacity:.7}
.log-table th[data-sort="desc"]::after{content:' ▼';opacity:.7}
.log-table td{padding:.5rem .75rem;border-bottom:1px solid var(--border);vertical-align:top;font-size:.8rem}
.log-table tr:last-child td{border-bottom:none}
.log-table tbody tr:hover td{background:#f5f3ff}
.log-num{color:var(--muted);font-size:.75rem;width:2.5rem;text-align:right}
.log-source{font-weight:500;color:var(--text);word-break:break-word;max-width:260px}
.log-date{color:var(--muted);white-space:nowrap;font-size:.78rem}
.log-concepts{display:flex;flex-wrap:wrap;gap:.25rem}
.log-concept-tag{font-size:.72rem;background:#f1f0ed;border:1px solid var(--border);padding:.1em .4em;border-radius:999px;color:var(--accent);text-decoration:none}
.log-concept-tag:hover{background:#ede9ff;border-color:var(--accent)}
.log-row-pending td{color:var(--muted)}
.log-row-pending .log-source{font-weight:400;font-style:italic}
.log-pending-badge{font-size:.72rem;color:var(--muted);background:#f1f0ed;border:1px solid var(--border);padding:.1em .5em;border-radius:999px}

/* ── Concepts page ───────────────────────────────────────── */
.alpha-nav{display:flex;flex-wrap:wrap;gap:.3rem;margin-bottom:1.75rem;padding-bottom:1rem;border-bottom:2px solid var(--border)}
.alpha-btn{font-size:.75rem;font-weight:600;min-width:1.9rem;text-align:center;padding:.25rem .4rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--surface);color:var(--muted);cursor:pointer;transition:background .13s,color .13s,border-color .13s;line-height:1;font-family:inherit}
.alpha-btn:hover{background:var(--bg);color:var(--text);border-color:var(--slate-400)}
.alpha-btn.active{background:var(--accent);color:#fff;border-color:var(--accent)}
.concepts-group{margin-bottom:1.75rem}
.concepts-letter{font-size:.68rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:.5rem;padding-bottom:.3rem;border-bottom:1px solid var(--border)}
.concepts-cloud{display:flex;flex-wrap:wrap;gap:.4rem}
.concept-pill{font-size:.8rem;background:var(--surface);border:1px solid var(--border);padding:.3em .8em;border-radius:999px;color:var(--accent);text-decoration:none;transition:border-color .13s,background .13s;white-space:nowrap}
.concept-pill:hover{background:#ede9ff;border-color:var(--accent)}

/* ── Hover tooltip ───────────────────────────────────────── */
#wiki-tooltip{position:fixed;z-index:9999;max-width:280px;pointer-events:none;display:none;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:.75rem 1rem;box-shadow:var(--shadow-md);line-height:1.5}
#wiki-tooltip .tip-title{font-size:.82rem;font-weight:600;color:var(--accent);margin-bottom:.3rem}
#wiki-tooltip .tip-summary{font-size:.78rem;color:var(--muted)}

/* ── Responsive ──────────────────────────────────────────── */
@media(max-width:768px){
  .sidebar{display:none}
  .content-wrap{padding:1.25rem}
  .concept-grid{grid-template-columns:1fr}
  .log-table{font-size:.8rem}
}
`.trim();
}

/**
 * Client-side sort + renumber script for the source log page.
 * Injected as an inline <script> in log.html only — not a shared asset.
 *
 * Column indices: 0=#  1=Source  2=Date  3=Concepts-count
 * Default sort: column 2 (date) descending — most recent first.
 * Exposes window.updateLogNumbers so render.js search can renumber after filtering.
 */
export function logJsContent(): string {
  return `
(function(){
  var t=document.querySelector('.log-table');
  if(!t)return;
  var tb=t.querySelector('tbody');
  var sc=2,sa=false;
  function cv(r,c){
    if(c===0)return parseInt(r.dataset.idx,10);
    if(c===1)return r.cells[1].textContent.toLowerCase();
    if(c===2)return r.dataset.date||'';
    return parseInt(r.dataset.count,10);
  }
  function renumber(){
    var n=0;
    Array.from(tb.rows).forEach(function(r){
      if(r.style.display!=='none'){n++;r.cells[0].textContent=n;}
    });
  }
  window.updateLogNumbers=renumber;
  function applySort(){
    var rows=Array.from(tb.rows);
    rows.sort(function(a,b){var av=cv(a,sc),bv=cv(b,sc);if(av<bv)return sa?-1:1;if(av>bv)return sa?1:-1;return 0;});
    rows.forEach(function(r){tb.appendChild(r);});
    renumber();
  }
  t.querySelectorAll('th[data-col]').forEach(function(th){
    th.addEventListener('click',function(){
      var col=parseInt(th.dataset.col,10);
      if(col===sc){sa=!sa;}else{sc=col;sa=col===1;}
      t.querySelectorAll('th[data-col]').forEach(function(h){h.dataset.sort=h===th?(sa?'asc':'desc'):'';});
      applySort();
    });
  });
  t.querySelector('th[data-col="2"]').dataset.sort='desc';
  applySort();
})();
`.trim();
}

/** Client-side script: renders inlined markdown via marked.js and powers search. */
export function renderJsContent(): string {
  return `
(function(){
  var el=document.getElementById('content');
  if(el&&typeof md!=='undefined'&&typeof marked!=='undefined'){
    marked.setOptions({gfm:true,breaks:false});
    el.innerHTML=marked.parse(md);
  }
  var s=document.getElementById('search');
  if(!s) return;

  // Snapshot initial open state so we can restore it when query is cleared.
  document.querySelectorAll('.sidebar details').forEach(function(det){
    det.dataset.initOpen=det.open?'1':'0';
  });

  s.addEventListener('input',function(e){
    var q=e.target.value.toLowerCase().trim();

    // Step 1: show/hide individual sidebar links.
    document.querySelectorAll('.sidebar a').forEach(function(a){
      var li=a.closest('li');
      if(li) li.style.display=(!q||a.textContent.toLowerCase().includes(q))?'':'none';
    });

    // Step 2: show/hide <details> sections and force-open those with matches.
    // Process in reverse DOM order so parents see their children's updated state.
    var allDets=Array.from(document.querySelectorAll('.sidebar details'));
    allDets.slice().reverse().forEach(function(det){
      if(!q){
        det.style.display='';
        det.open=det.dataset.initOpen==='1';
        return;
      }
      var hasVisible=Array.from(det.querySelectorAll('li')).some(function(li){
        return li.style.display!=='none';
      });
      det.style.display=hasVisible?'':'none';
      if(hasVisible) det.open=true;
    });

    // Step 3: filter concept cards on the index page.
    document.querySelectorAll('.concept-card').forEach(function(card){
      var text=(card.textContent||'').toLowerCase();
      card.style.display=(!q||text.includes(q))?'':'none';
    });

    // Step 4: filter log table rows; renumber visible rows after filtering.
    document.querySelectorAll('.log-table tbody tr').forEach(function(row){
      var text=(row.textContent||'').toLowerCase();
      row.style.display=(!q||text.includes(q))?'':'none';
    });
    if(typeof window.updateLogNumbers==='function')window.updateLogNumbers();

    // Step 5: filter concept pills; hide letter groups that become empty.
    // When query is cleared, restore the active letter filter instead of showing all groups.
    if(!q&&typeof window.applyAlphaFilter==='function'){
      window.applyAlphaFilter();
    }else{
      document.querySelectorAll('.concepts-group').forEach(function(grp){
        var pills=Array.from(grp.querySelectorAll('.concept-pill'));
        pills.forEach(function(pill){
          pill.style.display=(!q||pill.textContent.toLowerCase().includes(q))?'':'none';
        });
        grp.style.display=pills.some(function(p){return p.style.display!=='none';})?'':'none';
      });
    }
  });
})();

// Hover tooltips — show concept summary bubble when hovering wiki links.
// Reads window.wikiSummaries written by assets/summaries.js.
(function(){
  if(!window.wikiSummaries)return;
  var tip=document.createElement('div');
  tip.id='wiki-tooltip';
  tip.innerHTML='<div class="tip-title"></div><div class="tip-summary"></div>';
  document.body.appendChild(tip);
  var tTitle=tip.querySelector('.tip-title');
  var tSummary=tip.querySelector('.tip-summary');
  function pos(e){
    var x=e.clientX+14,y=e.clientY+14;
    if(x+294>window.innerWidth)x=e.clientX-298;
    if(y+90>window.innerHeight)y=e.clientY-90;
    tip.style.left=x+'px';tip.style.top=y+'px';
  }
  document.querySelectorAll('a[href]').forEach(function(a){
    var m=(a.getAttribute('href')||'').match(/([^/]+)\.html$/);
    if(!m)return;
    var d=window.wikiSummaries[m[1]];
    if(!d)return;
    a.addEventListener('mouseenter',function(e){
      tTitle.textContent=d.title;
      tSummary.textContent=d.summary;
      tip.style.display='block';
      pos(e);
    });
    a.addEventListener('mousemove',pos);
    a.addEventListener('mouseleave',function(){tip.style.display='none';});
  });
})();
`.trim();
}
