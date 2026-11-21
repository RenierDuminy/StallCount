// Standard cards for every overlay layout: player statistics, match statistics
// and team rosters, in the SAFDA standard design (styles in overlayCards.css).
//
// Imported first by overlayRuntime.js, so it runs before the runtime looks its
// elements up: it replaces each layout's own copies of these three cards with
// the standard ones, keeping every element id the runtime fills (scores, names,
// lists, colours), so the data wiring is unchanged. Player statistics keeps the
// layout's own height (read from the old card), so it still clears that
// layout's scoreboard.
//
// A layout that carries its own copies of the standard design opts out with
// <body data-cards="own"> (SAFDA standard, where the design comes from).

import "./overlayCards.css";

const PLAYER_STATS_HTML = `
  <div class="scc-player__team" id="bannerTeam">
    <div class="scc-player__logo" id="bannerLogoSlot">
      <div class="scc-player__logo-box" id="bannerLogoCell">
        <img id="bannerLogo" alt="" />
        <span id="bannerLogoFallback"></span>
      </div>
    </div>
    <span id="bannerPlayerName">PLAYER NAME</span>
  </div>
  <div class="scc-player__stats">
    <div class="scc-player__stat"><span class="scc-player__label">Goals</span><span class="scc-player__value" id="bannerStatGls">0</span></div>
    <div class="scc-player__stat"><span class="scc-player__label">Assists</span><span class="scc-player__value" id="bannerStatAst">0</span></div>
    <div class="scc-player__stat"><span class="scc-player__label">Blocks</span><span class="scc-player__value" id="bannerStatBlk">0</span></div>
    <div class="scc-player__stat"><span class="scc-player__label">Turnovers</span><span class="scc-player__value" id="bannerStatTrn">0</span></div>
  </div>`;

const statsColumn = (side) => `
  <div class="scc-stats__col scc-stats__col--team" id="matchStatsColumn${side}">
    <div class="scc-stats__team">
      <img class="scc-teamlogo" data-team-logo="${side}" alt="" />
      <span class="scc-stats__nameslot"><span id="matchStatsTeam${side}">Team ${side}</span></span>
    </div>
    <div class="scc-stats__value" id="matchStatsHolds${side}">--</div>
    <div class="scc-stats__value" id="matchStatsBreaks${side}">--</div>
    <div class="scc-stats__value" id="matchStatsTurnovers${side}">--</div>
    <div class="scc-stats__value" id="matchStatsBlocks${side}">--</div>
    <div class="scc-stats__value" id="matchStatsPossession${side}">--</div>
    <div class="scc-stats__value" id="matchStatsTimeouts${side}">--</div>
  </div>`;

const cardHead = (titleId, title) => `
  <div class="scc-head">
    <img class="scc-head__logo" data-event-logo alt="" />
    <span class="scc-head__title"><span id="${titleId}">${title}</span></span>
  </div>`;

const cardFoot = (statusId) => `
  <div class="scc-foot">
    <span data-event-name></span>
    <span class="scc-foot__dash" aria-hidden="true">–</span>
    <span ${statusId ? `id="${statusId}" ` : ""}data-role="match-db-status"></span>
  </div>`;

const MATCH_STATS_HTML = `
  <div class="scc-card">
    ${cardHead("matchStatsTitle", "Match statistics")}
    <div class="scc-stats">
      ${statsColumn("A")}
      <div class="scc-stats__col scc-stats__col--mid">
        <div id="matchStatsScoreline">0 - 0</div>
        <div class="scc-stats__label">Holds</div>
        <div class="scc-stats__label">Breaks</div>
        <div class="scc-stats__label">Turnovers</div>
        <div class="scc-stats__label">Blocks</div>
        <div class="scc-stats__label">Possession</div>
        <div class="scc-stats__label">Timeouts</div>
      </div>
      ${statsColumn("B")}
    </div>
    ${cardFoot("matchStatsPhase")}
  </div>`;

// Team logos on the inside of each team header, next to the middle line.
const TEAM_ROSTERS_HTML = `
  <div class="scc-card">
    ${cardHead("teamRostersTitle", "Team rosters")}
    <div class="scc-rosters">
      <div class="scc-rosters__col" id="teamRostersColumnA">
        <div class="scc-rosters__team"><span id="teamRostersTeamA">Team A</span><img class="scc-teamlogo" data-team-logo="A" alt="" /></div>
        <ul id="teamRostersListA"></ul>
      </div>
      <div class="scc-rosters__col" id="teamRostersColumnB">
        <div class="scc-rosters__team"><img class="scc-teamlogo" data-team-logo="B" alt="" /><span id="teamRostersTeamB">Team B</span></div>
        <ul id="teamRostersListB"></ul>
      </div>
    </div>
    ${cardFoot("")}
  </div>`;

const TEAM_LOGO_KEYS = { A: "stallcount:logo-team-a", B: "stallcount:logo-team-b" };

function readTeamLogo(slot) {
  try {
    return localStorage.getItem(TEAM_LOGO_KEYS[slot]) || "";
  } catch {
    return "";
  }
}

// Shows `src` in an <img>, marking it .has-image only once it has loaded
// (also when the same, already loaded image is shown again).
function showImage(img, src, onChange) {
  if (!img) return;
  if (!src) {
    img.removeAttribute("src");
    img.classList.remove("has-image");
    onChange?.(false);
    return;
  }
  if (img.getAttribute("src") === src && img.complete && img.naturalWidth > 0) {
    img.classList.add("has-image");
    onChange?.(true);
    return;
  }
  img.classList.remove("has-image");
  onChange?.(false);
  img.onload = () => {
    img.classList.add("has-image");
    onChange?.(true);
  };
  img.onerror = () => {
    img.classList.remove("has-image");
    onChange?.(false);
  };
  img.src = src;
}

function replaceCard(id, innerHtml, keepVerticalPlacement = false) {
  const old = document.getElementById(id);
  const parent = old?.parentElement || document.getElementById("canvas") || document.body;
  const card = document.createElement("div");
  card.id = id;
  card.setAttribute("data-sc-card", "");
  card.innerHTML = innerHtml;
  if (old && keepVerticalPlacement) {
    // Keep the layout's own height for this card (it sits clear of that
    // layout's scoreboard), read before the old card goes.
    const style = getComputedStyle(old);
    if (style.bottom && style.bottom !== "auto") card.style.setProperty("--scc-player-bottom", style.bottom);
    else if (style.top && style.top !== "auto") {
      card.style.setProperty("--scc-player-top", style.top);
      card.style.setProperty("--scc-player-bottom", "auto");
    }
  }
  if (old) old.replaceWith(card);
  else parent.append(card);
  return card;
}

function install() {
  if (document.body?.dataset.cards === "own") return;

  const player = replaceCard("overlayBanner", PLAYER_STATS_HTML, true);
  const matchStats = replaceCard("matchStatsBanner", MATCH_STATS_HTML);
  const rosters = replaceCard("teamRostersBanner", TEAM_ROSTERS_HTML);

  // Team logos on match statistics and team rosters (read when the page loads;
  // a changed logo reloads the overlay, see overlayRuntime.js).
  [matchStats, rosters].forEach((card) => {
    card.querySelectorAll("[data-team-logo]").forEach((img) => showImage(img, readTeamLogo(img.dataset.teamLogo)));
  });

  // Player statistics: the logo of whichever team the player is on (the
  // runtime marks the card .is-team-a / .is-team-b when it shows).
  const playerTeam = player.querySelector(".scc-player__team");
  const playerLogo = player.querySelector("#bannerLogo");
  const playerLogoBox = player.querySelector("#bannerLogoCell");
  const syncPlayerLogo = () => {
    const slot = player.classList.contains("is-team-b") ? "B" : "A";
    showImage(playerLogo, readTeamLogo(slot), (has) => {
      playerTeam.classList.toggle("has-logo", has);
      playerLogoBox.classList.toggle("has-image", has);
    });
  };
  new MutationObserver(syncPlayerLogo).observe(player, { attributes: true, attributeFilter: ["class"] });
  syncPlayerLogo();

  // Event logo (only a real one) and event name, from the runtime.
  window.addEventListener("overlay:event-info", (event) => {
    const { name, logo } = event.detail || {};
    if (typeof logo === "string") {
      document.querySelectorAll("[data-sc-card] [data-event-logo]").forEach((img) => showImage(img, logo));
    }
    if (typeof name === "string") {
      document.querySelectorAll("[data-sc-card] [data-event-name]").forEach((el) => {
        el.textContent = name;
      });
    }
  });

  // Team rosters: each list gets half its players as rows (rounded up, at most
  // 15), so its two columns are always balanced.
  ["teamRostersListA", "teamRostersListB"].forEach((id) => {
    const list = rosters.querySelector(`#${id}`);
    if (!list) return;
    const sync = () => {
      const count = list.querySelectorAll(".roster-banner-item:not(.is-empty)").length;
      list.style.setProperty("--scc-rows", String(Math.max(1, Math.min(15, Math.ceil(Math.min(count, 30) / 2)))));
    };
    new MutationObserver(sync).observe(list, { childList: true });
    sync();
  });
}

try {
  install();
} catch (error) {
  // Never take the overlay down: the layout's own cards stay if this fails.
  console.error("[overlay] standard cards not installed", error);
}
