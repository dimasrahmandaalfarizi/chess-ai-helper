/**
 * chess-app.js
 * Chess AI Helper — Main Application Logic
 * Powered by Stockfish.js (WebAssembly/Pure JS) via Web Worker
 */
"use strict";

// ─── Config ────────────────────────────────────────────────────────────────
const THINK_MS = () => parseInt($("#thinkTimeSelect").val() || 1000);
const MULTI_PV = 3;

// ─── State ─────────────────────────────────────────────────────────────────
let game = new Chess();
let board = null;
let isAnalyzing = false;
let highlightSqs = [];
let hoverHighlightSqs = [];
let moveHistory = []; // [{white:'e4', black:'e5'}, ...]
let gameMode = "suggest"; // suggest | play_white | play_black

// ─── Engine Initialization ─────────────────────────────────────────────────
const engine = new Worker("js/stockfish.js");
let engineReady = false;
let pvData = {}; // Stores multi-PV lines during analysis
let currentTurnInfo = { score_cp: 0, score_pawn: 0, mate_in: null };

engine.onmessage = function (event) {
  const line = event.data;
  if (!line) return;

  if (line === "uciok" || line === "readyok") {
    engineReady = true;
    return;
  }

  // Parse "info depth X multipv Z score cp N ... pv move1 move2 ..."
  if (
    line.startsWith("info") &&
    line.includes("pv ") &&
    !line.includes("string")
  ) {
    const multiPvMatch = line.match(/multipv (\d+)/);
    const pvIndex = multiPvMatch ? parseInt(multiPvMatch[1]) : 1;

    let scoreType = null;
    let scoreVal = null;

    const scoreCpMatch = line.match(/score cp (-?\d+)/);
    if (scoreCpMatch) {
      scoreType = "cp";
      scoreVal = parseInt(scoreCpMatch[1]);
    } else {
      const scoreMateMatch = line.match(/score mate (-?\d+)/);
      if (scoreMateMatch) {
        scoreType = "mate";
        scoreVal = parseInt(scoreMateMatch[1]);
      }
    }

    const pvMatch = line.match(/ pv (.*)/);
    if (pvMatch && scoreType !== null) {
      const pvMoves = pvMatch[1].trim().split(" ");

      pvData[pvIndex] = {
        score_cp: scoreType === "cp" ? scoreVal : scoreVal > 0 ? 30000 : -30000,
        score_pawn: scoreType === "cp" ? (scoreVal / 100).toFixed(2) : null,
        mate_in: scoreType === "mate" ? scoreVal : null,
        moves: pvMoves,
        bestmove: pvMoves[0],
      };

      // Top line updates the eval bar
      if (pvIndex === 1) {
        currentTurnInfo = pvData[pvIndex];
        updateEvalBar(currentTurnInfo.score_cp, game.turn());
      }
    }
  }

  // Parse "bestmove e2e4 [ponder e7e5]"
  if (line.startsWith("bestmove")) {
    const match = line.match(/^bestmove (\S+)(?:\s+ponder (\S+))?/);
    if (match) {
      const bestmove = match[1];
      if (bestmove !== "(none)" && bestmove !== "0000") {
        renderRecommendation(bestmove, pvData, game.turn());
        if ($("#autoHighlight").prop("checked")) {
          highlightMove(bestmove);
        }
        if ($("#autoPlay").prop("checked") && gameMode === "suggest") {
          applyAIMove(bestmove);
        }
      } else {
        $("#bestMoveDisplay").html(
          '<div class="best-move-idle">Tidak ada gerakan</div>',
        );
        $("#aiThinking").hide();
        isAnalyzing = false;
      }
    }
  }
};

// Initialize Engine Settings
engine.postMessage("uci");
engine.postMessage("setoption name Threads value 2");
engine.postMessage("setoption name Hash value 64");
engine.postMessage("setoption name MultiPV value " + MULTI_PV);
engine.postMessage("isready");

// ─── Board Init ────────────────────────────────────────────────────────────
function initBoard() {
  const cfg = {
    draggable: true,
    position: "start",
    moveSpeed: 300,
    snapbackSpeed: 400,
    snapSpeed: 150,
    onDragStart: onDragStart,
    onDrop: onDrop,
    onSnapEnd: onSnapEnd,
    pieceTheme:
      "https://chessboardjs.com/img/chesspieces/alpha/{piece}.png",
  };
  board = Chessboard("chessboard", cfg);
  $(window).resize(() => board.resize());
}

function onDragStart(source, piece) {
  if (game.game_over()) return false;
  if (isAnalyzing) return false;
  if (gameMode === "play_white" && piece.startsWith("b")) return false;
  if (gameMode === "play_black" && piece.startsWith("w")) return false;
  return true;
}

function onDrop(source, target) {
  clearHighlights();
  const move = game.move({ from: source, to: target, promotion: "q" });
  if (move === null) return "snapback";
  recordMove(move);
  updateUI();

  if (gameMode === "play_white" || gameMode === "play_black") {
    setTimeout(() => getAIMove(true), 300);
  } else {
    setTimeout(() => getAIMove(false), 300);
  }
}

function onSnapEnd() {
  board.position(game.fen());
}

// ─── Engine Trigger ───────────────────────────────────────────────────────
function getAIMove(autoPlay = false) {
  if (game.game_over()) return;

  isAnalyzing = true;
  $("#aiThinking").show();
  $("#bestMoveDisplay").html(
    '<div class="best-move-idle">Analyzing position...</div>',
  );
  $("#multiPVList").html("");

  pvData = {}; // Clear previous data

  const elo = parseInt($("#eloRange").val() || 0);
  const useElo = $("#gameModeSelect").val() !== "suggest" && elo > 0;

  // Apply Engine Options
  if (useElo) {
    engine.postMessage("setoption name UCI_LimitStrength value true");
    engine.postMessage(`setoption name UCI_Elo value ${elo}`);
  } else {
    engine.postMessage("setoption name UCI_LimitStrength value false");
    engine.postMessage("setoption name Skill Level value 20");
  }

  // Generate Moves String
  const history = game.history({ verbose: true });
  let movesStr = "";
  if (history.length > 0) {
    movesStr =
      " moves " +
      history.map((m) => m.from + m.to + (m.promotion || "")).join(" ");
  }

  // Trigger search
  engine.postMessage("position startpos" + movesStr);
  engine.postMessage(`go movetime ${THINK_MS()}`);

  // Handling autoplay state logic
  if (autoPlay) {
    $("#autoPlay").prop("checked", true); // Temporarily store intent if we override UI
  } else if (gameMode !== "suggest") {
    $("#autoPlay").prop("checked", false);
  }
}

// ─── Apply AI Move ─────────────────────────────────────────────────────────
function applyAIMove(uciMove) {
  const from = uciMove.slice(0, 2);
  const to = uciMove.slice(2, 4);
  const promo = uciMove[4] || "q";
  const move = game.move({ from, to, promotion: promo });
  if (move) {
    recordMove(move);
    board.position(game.fen());
    clearHighlights();
    highlightMove(uciMove);
    updateUI();

    if (!game.game_over() && gameMode === "suggest") {
      setTimeout(() => getAIMove(false), 400);
    }
  }
}

// ─── Move Classifications (rank-based, honest) ─────────────────────────────
function classifyMove(rankIndex) {
  if (rankIndex === 0)
    return {
      label: "Best",
      class: "badge-rank1",
      hlClass: "highlight-rank1",
      rankClass: "rank-1",
    };
  if (rankIndex === 1)
    return {
      label: "Excellent",
      class: "badge-rank2",
      hlClass: "highlight-rank2",
      rankClass: "rank-2",
    };
  if (rankIndex === 2)
    return {
      label: "Good",
      class: "badge-rank3",
      hlClass: "highlight-rank3",
      rankClass: "rank-3",
    };
  return {
    label: "Alt",
    class: "badge-neutral",
    hlClass: "highlight-to",
    rankClass: "",
  };
}

// Convert a sequence of UCI moves to SAN from current game position
function pvMovesToSAN(uciMoves, gameInstance) {
  const testGame = new Chess(gameInstance.fen());
  const sanMoves = [];
  for (const uci of uciMoves) {
    if (!uci || uci.length < 4) break;
    const move = testGame.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4] || undefined,
    });
    if (!move) break;
    sanMoves.push(move.san);
    if (sanMoves.length >= 4) break;
  }
  return sanMoves;
}

function handleHoverMove(uciMove, hlClass) {
  clearHoverHighlights();
  if (!uciMove) return;
  const from = uciMove.slice(0, 2);
  const to = uciMove.slice(2, 4);
  $(`[data-square="${from}"]`).addClass(hlClass);
  $(`[data-square="${to}"]`).addClass(hlClass);
  hoverHighlightSqs = [from, to, hlClass];
}

function clearHoverHighlights() {
  if (hoverHighlightSqs.length === 3) {
    $(`[data-square="${hoverHighlightSqs[0]}"]`).removeClass(
      hoverHighlightSqs[2],
    );
    $(`[data-square="${hoverHighlightSqs[1]}"]`).removeClass(
      hoverHighlightSqs[2],
    );
  }
  hoverHighlightSqs = [];
}

// ─── Render Recommendation ─────────────────────────────────────────────────
function renderRecommendation(bestUCI, linesData, turnIndicator) {
  isAnalyzing = false;
  $("#aiThinking").hide();

  const sortedLines = Object.values(linesData).sort((a, b) => {
    let sA = a.mate_in !== null ? (a.mate_in > 0 ? 30000 - a.mate_in : -30000 - a.mate_in) : a.score_cp;
    let sB = b.mate_in !== null ? (b.mate_in > 0 ? 30000 - b.mate_in : -30000 - b.mate_in) : b.score_cp;
    return turnIndicator === "w" ? sB - sA : sA - sB;
  });

  if (sortedLines.length === 0) return;

  let html = "";
  sortedLines.forEach((line, i) => {
    if (!line.bestmove) return;

    // Rank-based classification — honest and unambiguous
    const category = classifyMove(i);
    const san = uciToSAN(line.bestmove);
    const sc = formatScore(line.score_cp, line.mate_in);

    // Score color from white's perspective
    const whiteScore = turnIndicator === "w" ? (line.score_cp || 0) : -(line.score_cp || 0);
    const scClass = whiteScore > 20 ? "positive" : whiteScore < -20 ? "negative" : "neutral";

    // Convert pv moves to SAN for clean display
    const sanPV = pvMovesToSAN((line.moves || []).slice(1, 4), game);
    const pvPreview = sanPV.length > 0 ? sanPV.join(" ") : "";

    html += `
      <div class="pv-item ${category.rankClass}"
           onclick="applyAIMove('${line.bestmove}')"
           onmouseenter="handleHoverMove('${line.bestmove}', '${category.hlClass}')"
           onmouseleave="clearHoverHighlights()">
        <span class="pv-rank-badge ${category.class}">${category.label}</span>
        <span class="pv-move">${san || line.bestmove}</span>
        <span class="pv-line">${pvPreview}</span>
        <span class="pv-score ${scClass}">${sc}</span>
      </div>`;
  });

  $("#multiPVList").html(html);

  // Auto-play in play modes
  if ($("#gameModeSelect").val() === "play_white" && turnIndicator === "b") {
    applyAIMove(bestUCI);
  } else if ($("#gameModeSelect").val() === "play_black" && turnIndicator === "w") {
    applyAIMove(bestUCI);
  }
}

// ─── Eval Bar ──────────────────────────────────────────────────────────────
function updateEvalBar(cp, turn) {
  let whiteCp = turn === "b" ? -(cp || 0) : cp || 0;
  const clamped = Math.max(-600, Math.min(600, whiteCp));
  const pct = 50 + (clamped / 600) * 50;
  const pctFill = 100 - pct;

  $("#evalBarFill").css("width", pctFill + "%");
  const scoreText = formatScore(whiteCp, null, true);
  $("#evalScore").text(scoreText);

  // Advantage label
  let advText = "Equal position";
  const abs = Math.abs(whiteCp);
  const side = whiteCp > 0 ? "White" : "Black";
  if (abs >= 300) advText = `${side} is winning`;
  else if (abs >= 150) advText = `${side} is better`;
  else if (abs >= 50) advText = `${side} is slightly better`;
  $("#evalAdvantage").text(advText);
}

// ─── Highlight Squares ─────────────────────────────────────────────────────
function highlightMove(uciMove) {
  clearHighlights();
  const from = uciMove.slice(0, 2);
  const to = uciMove.slice(2, 4);
  $(`[data-square="${from}"]`).addClass("highlight-from");
  $(`[data-square="${to}"]`).addClass("highlight-to");
  highlightSqs = [from, to];
}

function clearHighlights() {
  highlightSqs.forEach((sq) =>
    $(`[data-square="${sq}"]`).removeClass("highlight-from highlight-to"),
  );
  highlightSqs = [];
}

// ─── History ───────────────────────────────────────────────────────────────
function recordMove(move) {
  const hist = game.history();
  moveHistory = [];
  for (let i = 0; i < hist.length; i += 2) {
    moveHistory.push({ white: hist[i] || "", black: hist[i + 1] || "" });
  }
  renderHistory();
  updateUndoBtn();
}

function renderHistory() {
  if (moveHistory.length === 0) {
    $("#moveHistory").html('<div class="history-idle">No moves yet</div>');
    return;
  }
  let html = "";
  moveHistory.forEach((pair, i) => {
    const isLastW = i === moveHistory.length - 1 && game.turn() === "b";
    const isLastB =
      (i === moveHistory.length - 1 && game.turn() === "w") ||
      (!pair.black && i === moveHistory.length - 1);
    html += `<span class="history-num">${i + 1}.</span>`;
    html += `<span class="history-move${isLastW ? " current" : ""}">${pair.white}</span>`;
    html += `<span class="history-move${pair.black && isLastB ? " current" : ""}">${pair.black || ""}</span>`;
  });
  $("#moveHistory").html(html);
  const el = document.getElementById("moveHistory");
  el.scrollTop = el.scrollHeight;
}

// ─── UI Update ─────────────────────────────────────────────────────────────
function updateUI() {
  const turn = game.turn();
  const moveNum = Math.floor(game.history().length / 2) + 1;

  const $turn = $("#turnIndicator");
  $turn.removeClass("white-turn black-turn");
  if (turn === "w") {
    $turn.addClass("white-turn");
    $("#turnText").text("White's Turn");
  } else {
    $turn.addClass("black-turn");
    $("#turnText").text("Black's Turn");
  }
  $("#moveCounter").text(`Move ${moveNum}`);

  let status = "";
  if (game.in_checkmate())
    status = `🏁 Checkmate! ${turn === "w" ? "Black" : "White"} wins`;
  else if (game.in_stalemate()) status = "🤝 Draw — Stalemate";
  else if (game.in_draw()) status = "🤝 Draw";
  else if (game.in_check()) status = "⚠️ Check!";
  $("#gameStatus").text(status);
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function uciToSAN(uciMove) {
  if (!uciMove || uciMove.length < 4) return uciMove;
  const from = uciMove.slice(0, 2);
  const to = uciMove.slice(2, 4);
  const promo = uciMove[4] || undefined;
  const testGame = new Chess(game.fen());
  const move = testGame.move({ from, to, promotion: promo });
  return move ? move.san : uciMove;
}

function formatScore(cp, mateIn, forWhite = false) {
  if (mateIn !== null && mateIn !== undefined) {
    return mateIn > 0 ? `M+${mateIn}` : `M${mateIn}`;
  }
  if (cp === null || cp === undefined) return "±0.00";
  const pawns = (cp / 100).toFixed(2);
  return cp >= 0 ? `+${pawns}` : `${pawns}`;
}

// ─── Controls ──────────────────────────────────────────────────────────────
$("#btnNewGame").on("click", () => {
  game = new Chess();
  board.start();
  moveHistory = [];
  isAnalyzing = false;
  clearHighlights();
  clearHoverHighlights();
  renderHistory();
  updateUI();
  updateUndoBtn();
  $("#bestMoveDisplay").html(
    '<div class="best-move-idle">Waiting...</div>',
  );
  $("#multiPVList").html("");
  $("#evalBarFill").css("width", "50%");
  $("#evalScore").text("0.00");
  $("#evalAdvantage").text("Posisi seimbang");
  $("#gameStatus").text("");

  if (gameMode === "play_black") setTimeout(() => getAIMove(true), 500);
  if (gameMode === "suggest") setTimeout(() => getAIMove(false), 500);
});

$("#btnFlipBoard").on("click", () => board.flip());

// ─── Undo Logic ────────────────────────────────────────────────────────────
function doUndo() {
  // Nothing to undo
  if (game.history().length === 0) return;

  engine.postMessage("stop");
  isAnalyzing = false;
  $("#aiThinking").hide();

  // In play modes: undo both the user's move and the AI's preceding reply
  // In suggest mode: undo one move at a time
  const stepsToUndo = gameMode !== "suggest" ? 2 : 1;
  for (let i = 0; i < stepsToUndo; i++) {
    if (game.history().length > 0) game.undo();
  }

  board.position(game.fen(), false);
  clearHighlights();
  clearHoverHighlights();

  // Rebuild move history from game
  const hist = game.history();
  moveHistory = [];
  for (let i = 0; i < hist.length; i += 2) {
    moveHistory.push({ white: hist[i] || "", black: hist[i + 1] || "" });
  }
  renderHistory();
  updateUI();
  updateUndoBtn();

  // Flash the undo button as visual feedback
  const $btn = $("#btnUndoMove");
  $btn.addClass("btn-undo-flash");
  setTimeout(() => $btn.removeClass("btn-undo-flash"), 300);

  // Re-trigger analysis
  if (!game.game_over()) {
    setTimeout(() => getAIMove(gameMode !== "suggest"), 300);
  } else {
    $("#multiPVList").html("");
  }
}

// Disable undo button when no history
function updateUndoBtn() {
  const $btn = $("#btnUndoMove");
  if (game.history().length === 0) {
    $btn.prop("disabled", true).addClass("btn-disabled");
  } else {
    $btn.prop("disabled", false).removeClass("btn-disabled");
  }
}

$("#btnUndoMove").on("click", doUndo);

// Ctrl+Z keyboard shortcut
$(document).on("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
    e.preventDefault();
    doUndo();
  }
});


$("#btnCopyPGN").on("click", () => {
  navigator.clipboard
    .writeText(game.pgn())
    .then(() => {
      const $b = $("#btnCopyPGN");
      const orig = $b.text();
      $b.text("Copied!");
      setTimeout(() => $b.text(orig), 2000);
    })
    .catch(() => alert(game.pgn()));
});

$("#gameModeSelect").on("change", function () {
  gameMode = this.value;
  const showElo = gameMode !== "suggest";
  $("#eloControl").toggle(showElo);
  $("#btnNewGame").trigger("click");
});

$("#eloRange").on("input", function () {
  $("#eloValue").text(this.value);
});

$("#autoPlay").on("change", function () {
  if (
    this.checked &&
    gameMode === "suggest" &&
    !game.game_over() &&
    !isAnalyzing
  ) {
    getAIMove(true);
  }
});

// ─── Bootstrap ─────────────────────────────────────────────────────────────
$(document).ready(() => {
  initBoard();
  updateUI();
  updateUndoBtn();
  setTimeout(() => getAIMove(false), 800);
});
