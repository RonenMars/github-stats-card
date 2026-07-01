// GitHub stats card — live SVG rendered at the Cloudflare edge.
// Fetches all-time stats via the GitHub GraphQL API and renders the Catppuccin card.
// Cached for 1h so GitHub's image proxy doesn't exhaust the API rate limit.

const CACHE_SECONDS = 3600;

export default {
  async fetch(request, env, ctx) {
    const cache = caches.default;
    const cacheKey = new Request(new URL(request.url).toString(), request);

    let cached = await cache.match(cacheKey);
    if (cached) return cached;

    const username = env.GITHUB_USERNAME || "RonenMars";
    const path = new URL(request.url).pathname;
    let body;
    try {
      body =
        path === "/langs"
          ? renderLangsCard(await fetchLangs(username, env.GITHUB_TOKEN))
          : renderCard(await fetchStats(username, env.GITHUB_TOKEN));
    } catch (err) {
      // Fail visibly but don't 500 into a broken image — render an error card.
      return svgResponse(errorCard(String(err.message || err)), 60);
    }

    const response = svgResponse(body, CACHE_SECONDS);
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  },
};

function svgResponse(svg, maxAge) {
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": `public, max-age=${maxAge}, s-maxage=${maxAge}`,
    },
  });
}

// --- data ---------------------------------------------------------------

async function fetchStats(username, token) {
  if (!token) throw new Error("GITHUB_TOKEN secret is not set");

  // Contribution years, then per-year commits (GraphQL only exposes commits per year).
  const yearsData = await gql(
    token,
    `query($login:String!){ user(login:$login){ contributionsCollection{ contributionYears } } }`,
    { login: username }
  );
  const years = yearsData.user.contributionsCollection.contributionYears;

  // Build one aliased query for all per-year commit + review sums.
  const yearFields = years
    .map(
      (y) => `y${y}: contributionsCollection(from:"${y}-01-01T00:00:00Z", to:"${y}-12-31T23:59:59Z"){
        totalCommitContributions totalPullRequestReviewContributions }`
    )
    .join("\n");

  const data = await gql(
    token,
    `query($login:String!){
      user(login:$login){
        repositories(ownerAffiliations:OWNER, privacy:PUBLIC){ totalCount }
        prAll: pullRequests{ totalCount }
        prMerged: pullRequests(states:MERGED){ totalCount }
        ${yearFields}
      }
    }`,
    { login: username }
  );

  const u = data.user;
  let commits = 0;
  let reviews = 0;
  for (const y of years) {
    commits += u[`y${y}`].totalCommitContributions;
    reviews += u[`y${y}`].totalPullRequestReviewContributions;
  }

  return {
    commits,
    pullRequests: u.prAll.totalCount,
    repos: u.repositories.totalCount,
    merged: u.prMerged.totalCount,
    reviews,
  };
}

async function gql(token, query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "github-stats-card-worker",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

const HIDDEN_LANGS = new Set(["html", "shell"]);
const LANGS_SHOWN = 6;

async function fetchLangs(username, token) {
  if (!token) throw new Error("GITHUB_TOKEN secret is not set");

  const data = await gql(
    token,
    `query($login:String!){
      user(login:$login){
        repositories(ownerAffiliations:OWNER, privacy:PUBLIC, isFork:false, first:100){
          nodes{ languages(first:10, orderBy:{field:SIZE, direction:DESC}){
            edges{ size node{ name } }
          } }
        }
      }
    }`,
    { login: username }
  );

  const bytes = new Map();
  for (const repo of data.user.repositories.nodes) {
    for (const edge of repo.languages.edges) {
      const name = edge.node.name;
      if (HIDDEN_LANGS.has(name.toLowerCase())) continue;
      bytes.set(name, (bytes.get(name) || 0) + edge.size);
    }
  }

  const top = [...bytes.entries()].sort((a, b) => b[1] - a[1]).slice(0, LANGS_SHOWN);
  const total = top.reduce((sum, [, size]) => sum + size, 0);
  return top.map(([name, size]) => ({ name, pct: (size / total) * 100 }));
}

// --- rendering ----------------------------------------------------------

// 3491 -> "3.5K", 39 -> "39", 512 -> "512" (K only at >=1000)
export function fmt(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

export function renderCard(s) {
  const rows = [
    { label: "Commits:", value: fmt(s.commits), icon: iconCommit },
    { label: "Pull Requests:", value: fmt(s.pullRequests), icon: iconPR },
    { label: "Public Repos:", value: fmt(s.repos), icon: iconRepo },
    { label: "PR Reviews:", value: fmt(s.reviews), icon: iconCheck },
    { label: "Merged PRs:", value: fmt(s.merged), icon: iconMerge },
  ];

  const rowSvg = rows
    .map(
      (r, i) => `
    <g transform="translate(0,${i * 29})">
      ${r.icon}
      <text x="24" y="12" class="label">${r.label}</text><text x="160" y="12" class="value">${r.value}</text>
    </g>`
    )
    .join("");

  return `<svg width="450" height="213" viewBox="0 0 450 213" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A few numbers I'm proud of">
  <style>
    .bg{fill:#1e1e2e}
    .title{fill:#cba6f7;font:600 17px 'Segoe UI',system-ui,-apple-system,sans-serif}
    .label{fill:#cdd6f4;font:400 13px 'Segoe UI',system-ui,-apple-system,sans-serif}
    .value{fill:#a6e3a1;font:500 14px 'Segoe UI',system-ui,-apple-system,sans-serif}
    .icon{fill:none;stroke:#cba6f7;stroke-width:1.1;stroke-linecap:round;stroke-linejoin:round}
    .ghmark{fill:#cba6f7}
    .ring-bg{stroke:#313244}
    .ring-fg{stroke:#cba6f7}
    .sub{fill:#6c7086;font:600 10px 'Segoe UI',system-ui,sans-serif;letter-spacing:.4px}
    .bar{fill:#cba6f7}
  </style>
  <rect x="0.5" y="0.5" width="449" height="212" rx="12" class="bg" stroke="#313244"/>

 <g transform="translate(0,8)">
  <g transform="translate(25,10)">
    <rect class="bar" x="0"  y="4" width="4" height="16" rx="1.5" style="transform-origin:2px 20px"><animateTransform attributeName="transform" type="scale" values="1 0;1 1;1 .8" keyTimes="0;0.6;1" dur="1.2s" begin="0s" fill="freeze" additive="sum"/></rect>
    <rect class="bar" x="7"  y="0" width="4" height="20" rx="1.5" style="transform-origin:9px 20px"><animateTransform attributeName="transform" type="scale" values="1 0;1 1;1 1" keyTimes="0;0.6;1" dur="1.2s" begin="0s" fill="freeze" additive="sum"/></rect>
    <rect class="bar" x="14" y="8" width="4" height="12" rx="1.5" style="transform-origin:16px 20px"><animateTransform attributeName="transform" type="scale" values="1 0;1 .8;1 .6" keyTimes="0;0.6;1" dur="1.2s" begin="0s" fill="freeze" additive="sum"/></rect>
  </g>
  <text x="52" y="30" class="title">A few numbers I'm proud of</text>

  <g transform="translate(25,52)">${rowSvg}
  </g>

  <g transform="translate(340,100)">
    <circle r="46" class="ring-bg" fill="none" stroke-width="6"/>
    <circle r="46" class="ring-fg" fill="none" stroke-width="6" stroke-linecap="round" stroke-dasharray="289" stroke-dashoffset="43" transform="rotate(-90)"/>
    <path class="ghmark" transform="translate(-14,-14) scale(1.16)" d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.2.8-.5v-2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.4-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 015.8 0C17.3 4.8 18.3 5.1 18.3 5.1c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.6.8.5A11.5 11.5 0 0023.5 12C23.5 5.7 18.3.5 12 .5z"/>
  </g>
  <text x="340" y="180" text-anchor="middle" class="sub">ALL-TIME · SINCE 2014</text>
 </g>
</svg>`;
}

const iconCommit = `<line class="icon" x1="0" y1="8" x2="4.5" y2="8"/><line class="icon" x1="11.5" y1="8" x2="16" y2="8"/><circle class="icon" cx="8" cy="8" r="3"/>`;
const iconPR = `<circle class="icon" cx="4" cy="3.5" r="2"/><circle class="icon" cx="4" cy="13" r="2"/><circle class="icon" cx="13" cy="5" r="2"/><line class="icon" x1="4" y1="5.5" x2="4" y2="11"/><path class="icon" d="M13 7v2a3 3 0 01-3 3H6.5"/>`;
const iconRepo = `<path class="icon" d="M3 2h9a1 1 0 011 1v11H4a1 1 0 01-1-1z"/><path class="icon" d="M3 12a1 1 0 011-1h9"/>`;
const iconCheck = `<path class="icon" d="M2 8.5l3.5 3.5L14 4"/>`;
const iconMerge = `<circle class="icon" cx="4" cy="3.5" r="2"/><circle class="icon" cx="4" cy="13" r="2"/><circle class="icon" cx="13" cy="9" r="2"/><line class="icon" x1="4" y1="5.5" x2="4" y2="11"/><path class="icon" d="M4 7a5 5 0 005 5h2"/>`;

// Catppuccin pastel per language; muted gray fallback for anything else.
const LANG_COLORS = {
  TypeScript: "#89b4fa",
  JavaScript: "#f9e2af",
  Python: "#94e2d5",
  Kotlin: "#cba6f7",
  Swift: "#fab387",
  Go: "#89dceb",
  Ruby: "#f38ba8",
  Rust: "#eba0ac",
  Java: "#f9e2af",
  Dart: "#89dceb",
  "C++": "#f5c2e7",
  C: "#b4befe",
};

export function renderLangsCard(langs) {
  const W = 340;
  const BAR_X = 25;
  const BAR_W = W - 50;

  // stacked bar segments, SMIL width grow staggered 80ms
  let x = BAR_X;
  const segments = langs
    .map((l, i) => {
      const w = Math.max(2, (l.pct / 100) * BAR_W);
      // static width = final state, so the bar renders even when SMIL never runs (camo/reduced-motion)
      const seg = `<rect x="${x.toFixed(1)}" y="52" width="${w.toFixed(1)}" height="8" fill="${LANG_COLORS[l.name] || "#9399b2"}">
      <animate attributeName="width" values="0;${w.toFixed(1)}" dur="0.6s" begin="${(i * 0.08).toFixed(2)}s" fill="freeze"/></rect>`;
      x += w;
      return seg;
    })
    .join("\n    ");

  // 2-column legend, 3 rows per column
  const legend = langs
    .map((l, i) => {
      const col = Math.floor(i / 3);
      const row = i % 3;
      const lx = 25 + col * 155;
      const ly = 92 + row * 29;
      return `<circle cx="${lx + 4}" cy="${ly - 4}" r="4" fill="${LANG_COLORS[l.name] || "#9399b2"}"/>
    <text x="${lx + 16}" y="${ly}" class="label">${l.name}</text><text x="${lx + 92}" y="${ly}" class="value">${l.pct.toFixed(1)}%</text>`;
    })
    .join("\n    ");

  return `<svg width="${W}" height="213" viewBox="0 0 ${W} 213" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="What I write in">
  <style>
    .bg{fill:#1e1e2e}
    .title{fill:#cba6f7;font:600 17px 'Segoe UI',system-ui,-apple-system,sans-serif}
    .label{fill:#cdd6f4;font:400 13px 'Segoe UI',system-ui,-apple-system,sans-serif}
    .value{fill:#a6e3a1;font:500 13px 'Segoe UI',system-ui,-apple-system,sans-serif}
    .icon{fill:none;stroke:#cba6f7;stroke-width:1.1;stroke-linecap:round;stroke-linejoin:round}
    .sub{fill:#6c7086;font:600 10px 'Segoe UI',system-ui,sans-serif;letter-spacing:.4px}
  </style>
  <rect x="0.5" y="0.5" width="${W - 1}" height="212" rx="12" class="bg" stroke="#313244"/>

 <g transform="translate(0,8)">
  <!-- title glyph: code brackets, gently open once on load -->
  <g transform="translate(25,14)">
    <animate attributeName="opacity" values="0;1" dur="0.9s" begin="0s" fill="freeze" calcMode="spline" keySplines="0.25 0.1 0.25 1" keyTimes="0;1"/>
    <path class="icon" d="M6 2L1 8l5 6">
      <animateTransform attributeName="transform" type="translate" values="1.5 0;0 0" keyTimes="0;1" dur="0.9s" begin="0s" fill="freeze" calcMode="spline" keySplines="0.25 0.1 0.25 1"/>
    </path>
    <path class="icon" d="M12 2l5 6-5 6">
      <animateTransform attributeName="transform" type="translate" values="-1.5 0;0 0" keyTimes="0;1" dur="0.9s" begin="0s" fill="freeze" calcMode="spline" keySplines="0.25 0.1 0.25 1"/>
    </path>
  </g>
  <text x="52" y="30" class="title">What I write in</text>

  <rect x="${BAR_X}" y="52" width="${BAR_W}" height="8" rx="4" fill="#313244"/>
  <g clip-path="url(#barclip)">
    ${segments}
  </g>
  <clipPath id="barclip"><rect x="${BAR_X}" y="52" width="${BAR_W}" height="8" rx="4"/></clipPath>

  <g>
    ${legend}
  </g>

  <text x="${W - 25}" y="180" text-anchor="end" class="sub">PUBLIC REPOS · BY BYTES</text>
 </g>
</svg>`;
}

function errorCard(msg) {
  return `<svg width="450" height="80" xmlns="http://www.w3.org/2000/svg">
  <rect width="450" height="80" rx="12" fill="#1e1e2e" stroke="#f38ba8"/>
  <text x="20" y="35" fill="#f38ba8" font-family="sans-serif" font-size="13" font-weight="600">stats card error</text>
  <text x="20" y="55" fill="#cdd6f4" font-family="sans-serif" font-size="11">${msg.replace(/[<&]/g, "")}</text>
</svg>`;
}
