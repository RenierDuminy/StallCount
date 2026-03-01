import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const PDF_SERIES_COLORS = {
  teamA: "#1d4ed8",
  teamB: "#b91c1c",
};

const PDF_BAND_COLORS = {
  timeout: "rgba(59, 130, 246, 0.12)",
  stoppage: "rgba(185, 28, 28, 0.14)",
  halftime: "rgba(16, 185, 129, 0.16)",
};

const PDF_THEME = {
  pageBg: [7, 24, 19],
  pageTop: [10, 34, 27],
  pageBottom: [9, 31, 24],
  pageGlow: [18, 55, 43],
  card: [18, 43, 35],
  cardAlt: [22, 54, 44],
  cardSoft: [14, 37, 30],
  border: [24, 69, 56],
  borderStrong: [38, 101, 83],
  ink: [230, 244, 236],
  inkStrong: [249, 255, 250],
  inkMuted: [153, 184, 169],
  accent: [198, 255, 98],
  accentStrong: [166, 255, 62],
  accentInk: [4, 18, 12],
};

const PAGE_MARGIN = 12;
const PAGE_TOP = 18;
const PAGE_FOOTER_SPACE = 16;

function safeText(value, fallback = "--") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text ? text : fallback;
}

function safeNumber(value, fallback = "--") {
  return Number.isFinite(value) ? String(value) : fallback;
}

function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function sanitizeFilePart(value) {
  return safeText(value, "team")
    .replace(/[<>:"/\\|?*]+/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 40);
}

function getPageWidth(doc) {
  return doc.internal.pageSize.getWidth();
}

function getPageHeight(doc) {
  return doc.internal.pageSize.getHeight();
}

function getContentWidth(doc) {
  return getPageWidth(doc) - PAGE_MARGIN * 2;
}

function paintPageBackground(doc) {
  const pageWidth = getPageWidth(doc);
  const pageHeight = getPageHeight(doc);

  doc.setFillColor(...PDF_THEME.pageBg);
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  doc.setFillColor(...PDF_THEME.pageTop);
  doc.rect(0, 0, pageWidth, 10, "F");

  doc.setFillColor(...PDF_THEME.pageGlow);
  doc.rect(0, 10, pageWidth, 5, "F");

  doc.setFillColor(...PDF_THEME.pageBottom);
  doc.rect(0, pageHeight - 7, pageWidth, 7, "F");
}

function addThemedPage(doc) {
  doc.addPage();
  paintPageBackground(doc);
}

function drawRoundedPanel(doc, { x, y, width, height, fill = PDF_THEME.card, border = PDF_THEME.border }) {
  doc.setFillColor(...fill);
  doc.setDrawColor(...border);
  doc.roundedRect(x, y, width, height, 3, 3, "FD");
}

function drawTag(doc, { x, y, text, fill, border, textColor }) {
  const label = safeText(text, "");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.2);
  const width = Math.max(24, doc.getTextWidth(label) + 8);
  doc.setFillColor(...fill);
  doc.setDrawColor(...border);
  doc.roundedRect(x, y, width, 6, 3, 3, "FD");
  doc.setTextColor(...textColor);
  doc.text(label, x + width / 2, y + 4.1, { align: "center" });
  return width;
}

function drawFooter(doc, pageNumber) {
  const pageWidth = getPageWidth(doc);
  const pageHeight = getPageHeight(doc);

  doc.setDrawColor(...PDF_THEME.border);
  doc.line(PAGE_MARGIN, pageHeight - 9, pageWidth - PAGE_MARGIN, pageHeight - 9);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_THEME.inkMuted);
  doc.text("StallCount match report", PAGE_MARGIN, pageHeight - 4.4);
  doc.text(`Page ${pageNumber}`, pageWidth - PAGE_MARGIN, pageHeight - 4.4, { align: "right" });
}

function decoratePages(doc) {
  const totalPages = doc.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    doc.setPage(pageNumber);
    drawFooter(doc, pageNumber);
  }
}

function getInsightValue(rows, label, fallback = "--") {
  const match = (rows || []).find((row) => row?.label === label);
  return safeText(match?.value, fallback);
}

function buildTableTheme(fillColor = PDF_THEME.card) {
  return {
    styles: {
      fontSize: 8.2,
      cellPadding: 1.5,
      textColor: PDF_THEME.ink,
      fillColor,
      lineColor: PDF_THEME.border,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: PDF_THEME.cardAlt,
      textColor: PDF_THEME.inkStrong,
      lineColor: PDF_THEME.borderStrong,
      lineWidth: 0.2,
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: PDF_THEME.cardAlt },
  };
}

function getTableBlockHeight(rowCount, rowHeight = 6.7, minHeight = 20, padding = 8) {
  return Math.max(minHeight, (Math.max(1, rowCount) + 1) * rowHeight + padding);
}

function toInsightRows(rows) {
  if ((rows || []).length) {
    return rows.map((row) => [safeText(row.label), safeText(row.value)]);
  }
  return [["--", "--"]];
}

function toPlayerRows(list) {
  const rows = (list || []).slice(0, 8).map((row) => [safeText(row.player), safeNumber(row.count)]);
  return rows.length ? rows : [["--", "--"]];
}

function toConnectionRows(list) {
  const rows = (list || [])
    .slice(0, 6)
    .map((row) => [safeText(row.assist), safeText(row.scorer), safeNumber(row.count)]);
  return rows.length ? rows : [["--", "--", "--"]];
}

function drawPageHeader(doc, { eyebrow, title, subtitle, rightTag }) {
  const contentWidth = getContentWidth(doc);
  const shellHeight = 22;

  drawRoundedPanel(doc, {
    x: PAGE_MARGIN,
    y: PAGE_TOP,
    width: contentWidth,
    height: shellHeight,
    fill: PDF_THEME.cardAlt,
    border: PDF_THEME.borderStrong,
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.4);
  doc.setTextColor(...PDF_THEME.accent);
  doc.text(safeText(eyebrow, ""), PAGE_MARGIN + 4, PAGE_TOP + 5.3);

  doc.setFontSize(14);
  doc.setTextColor(...PDF_THEME.inkStrong);
  doc.text(safeText(title, "--"), PAGE_MARGIN + 4, PAGE_TOP + 12.2);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_THEME.inkMuted);
  doc.text(safeText(subtitle, "--"), PAGE_MARGIN + 4, PAGE_TOP + 17.8, {
    maxWidth: contentWidth - 38,
  });

  if (rightTag) {
    const tagWidth = Math.max(24, doc.getTextWidth(safeText(rightTag, "")) + 8);
    drawTag(doc, {
      x: PAGE_MARGIN + contentWidth - tagWidth - 4,
      y: PAGE_TOP + 4,
      text: rightTag,
      fill: PDF_THEME.accent,
      border: PDF_THEME.accentStrong,
      textColor: PDF_THEME.accentInk,
    });
  }

  return PAGE_TOP + shellHeight + 6;
}

function drawSectionLabel(doc, text, y) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...PDF_THEME.accent);
  doc.text(text, PAGE_MARGIN, y);
  const width = doc.getTextWidth(text);
  doc.setDrawColor(...PDF_THEME.borderStrong);
  doc.setLineWidth(0.5);
  doc.line(PAGE_MARGIN, y + 1.6, Math.min(PAGE_MARGIN + width + 6, getPageWidth(doc) - PAGE_MARGIN), y + 1.6);
}

function drawKpiStrip(doc, { y, items }) {
  const contentWidth = getContentWidth(doc);
  const gap = 3;
  const cardWidth = (contentWidth - gap * (items.length - 1)) / items.length;
  const height = 16;

  items.forEach((item, index) => {
    const x = PAGE_MARGIN + index * (cardWidth + gap);
    drawRoundedPanel(doc, {
      x,
      y,
      width: cardWidth,
      height,
      fill: index % 2 === 0 ? PDF_THEME.card : PDF_THEME.cardSoft,
      border: PDF_THEME.border,
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...PDF_THEME.inkMuted);
    doc.text(safeText(item.label, "").toUpperCase(), x + 3, y + 4.8);

    doc.setFontSize(10.5);
    doc.setTextColor(...PDF_THEME.inkStrong);
    doc.text(safeText(item.value, "--"), x + 3, y + 11.4, {
      maxWidth: cardWidth - 6,
    });
  });

  return y + height + 5;
}

function drawTwoColumnInsightCards(doc, { y, leftTitle, leftRows, rightTitle, rightRows }) {
  const contentWidth = getContentWidth(doc);
  const gap = 4;
  const columnWidth = (contentWidth - gap) / 2;
  const leftBody = toInsightRows(leftRows);
  const rightBody = toInsightRows(rightRows);
  const leftHeight = getTableBlockHeight(leftBody.length, 7.1, 32, 10);
  const rightHeight = getTableBlockHeight(rightBody.length, 7.1, 32, 10);
  const tableY = y + 6;

  drawSectionLabel(doc, leftTitle, y);
  drawSectionLabel(doc, rightTitle, y);

  drawRoundedPanel(doc, {
    x: PAGE_MARGIN,
    y: y + 2.5,
    width: columnWidth,
    height: leftHeight,
  });
  drawRoundedPanel(doc, {
    x: PAGE_MARGIN + columnWidth + gap,
    y: y + 2.5,
    width: columnWidth,
    height: rightHeight,
  });

  const leftTheme = buildTableTheme();
  autoTable(doc, {
    startY: tableY,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN + columnWidth + gap },
    tableWidth: columnWidth,
    head: [[leftTitle, "Value"]],
    body: leftBody,
    ...leftTheme,
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: columnWidth * 0.5 },
      1: { cellWidth: "auto" },
    },
  });
  const leftFinalY = doc.lastAutoTable?.finalY || tableY;

  const rightTheme = buildTableTheme();
  autoTable(doc, {
    startY: tableY,
    margin: { left: PAGE_MARGIN + columnWidth + gap, right: PAGE_MARGIN },
    tableWidth: columnWidth,
    head: [[rightTitle, "Value"]],
    body: rightBody,
    ...rightTheme,
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: columnWidth * 0.5 },
      1: { cellWidth: "auto" },
    },
  });
  const rightFinalY = doc.lastAutoTable?.finalY || tableY;

  return Math.max(leftFinalY, rightFinalY, y + 2.5 + leftHeight, y + 2.5 + rightHeight) + 4;
}

function drawHeroPage(doc, { report, teamAName, teamBName, scoreA, scoreB, generatedLabel }) {
  const contentWidth = getContentWidth(doc);
  const heroHeight = 42;
  const heroY = PAGE_TOP;

  drawRoundedPanel(doc, {
    x: PAGE_MARGIN,
    y: heroY,
    width: contentWidth,
    height: heroHeight,
    fill: PDF_THEME.cardAlt,
    border: PDF_THEME.borderStrong,
  });

  let tagX = PAGE_MARGIN + 4;
  tagX += drawTag(doc, {
    x: tagX,
    y: heroY + 4,
    text: "Scrimmage Report",
    fill: PDF_THEME.accent,
    border: PDF_THEME.accentStrong,
    textColor: PDF_THEME.accentInk,
  });
  tagX += 3;
  drawTag(doc, {
    x: tagX,
    y: heroY + 4,
    text: "A4 Layout",
    fill: PDF_THEME.card,
    border: PDF_THEME.borderStrong,
    textColor: PDF_THEME.inkMuted,
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...PDF_THEME.inkStrong);
  doc.text(`${teamAName} vs ${teamBName}`, PAGE_MARGIN + 4, heroY + 17);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.8);
  doc.setTextColor(...PDF_THEME.inkMuted);
  doc.text(`Generated ${generatedLabel}`, PAGE_MARGIN + 4, heroY + 23);
  doc.text("Built from the live scrimmage report data.", PAGE_MARGIN + 4, heroY + 28.5);

  const scorePanelWidth = 42;
  const scorePanelX = PAGE_MARGIN + contentWidth - scorePanelWidth - 4;
  drawRoundedPanel(doc, {
    x: scorePanelX,
    y: heroY + 7,
    width: scorePanelWidth,
    height: 22,
    fill: PDF_THEME.cardSoft,
    border: PDF_THEME.borderStrong,
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...PDF_THEME.accent);
  doc.text(`${scoreA} - ${scoreB}`, scorePanelX + scorePanelWidth / 2, heroY + 20.8, { align: "center" });

  let y = heroY + heroHeight + 6;
  y = drawKpiStrip(doc, {
    y,
    items: [
      { label: "Match date", value: getInsightValue(report?.insights?.match, "Match date") },
      { label: "Duration", value: getInsightValue(report?.insights?.match, "Match duration") },
      { label: "Avg point pace", value: getInsightValue(report?.insights?.tempo, "Avg time per point") },
    ],
  });

  y = drawTwoColumnInsightCards(doc, {
    y,
    leftTitle: "Match insight",
    leftRows: report?.insights?.match,
    rightTitle: "Tempo insight",
    rightRows: report?.insights?.tempo,
  });

  return y;
}

function drawReportTimelineImage({ report, teamAName, teamBName, scoreA, scoreB }) {
  if (typeof document === "undefined") return null;

  const timeline = report?.timeline;
  const possessionTimeline = report?.possessionTimeline;
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 980;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const width = canvas.width;
  const height = canvas.height;
  const chartLeft = 118;
  const chartRight = width - 72;
  const chartTop = 138;
  const chartBottom = height - 222;
  const chartWidth = chartRight - chartLeft;
  const chartHeight = chartBottom - chartTop;
  const possessionBandTop = chartBottom + 26;
  const possessionBandHeight = 26;
  const possessionBandBottom = possessionBandTop + possessionBandHeight;
  const labelA = safeText(teamAName, "Team A");
  const labelB = safeText(teamBName, "Team B");

  ctx.fillStyle = "#11261d";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#16352b";
  ctx.strokeStyle = "#2a6a57";
  ctx.lineWidth = 2;
  ctx.fillRect(32, 28, width - 64, height - 56);
  ctx.strokeRect(32, 28, width - 64, height - 56);

  ctx.fillStyle = "#f9fffa";
  ctx.font = "bold 42px Helvetica";
  ctx.fillText("Score progression", chartLeft, 66);
  ctx.font = "28px Helvetica";
  ctx.fillStyle = "#d8eee4";
  ctx.fillText(`${labelA} ${scoreA} - ${scoreB} ${labelB}`, chartLeft, 100);

  if (!timeline) {
    ctx.fillStyle = "#9db9aa";
    ctx.font = "28px Helvetica";
    ctx.fillText("Timeline data unavailable.", chartLeft, chartTop + 42);
    return canvas.toDataURL("image/png");
  }

  const seriesA = timeline.series?.teamA || [];
  const seriesB = timeline.series?.teamB || [];
  const scoringPoints = timeline.scoringPoints || [];
  const bands = timeline.bands || [];
  const ticks = timeline.timeTicks || [];
  const possessionSegments = possessionTimeline?.segments || [];
  const minTime = Number.isFinite(timeline.minTime) ? timeline.minTime : Date.now();
  const maxTime = Number.isFinite(timeline.maxTime) ? timeline.maxTime : minTime + 60_000;
  const timeRange = Math.max(1, maxTime - minTime);
  const yMax = Math.max(10, Number.isFinite(timeline.maxScore) ? timeline.maxScore : 0);

  const getX = (time) => chartLeft + ((time - minTime) / timeRange) * chartWidth;
  const getY = (value) => chartBottom - (value / (yMax || 1)) * chartHeight;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(chartLeft, chartTop, chartWidth, chartHeight);

  bands.forEach((band) => {
    ctx.fillStyle = PDF_BAND_COLORS[band.type] || "rgba(148, 163, 184, 0.14)";
    const startX = getX(band.start);
    const endX = getX(band.end);
    ctx.fillRect(startX, chartTop, Math.max(2, endX - startX), chartHeight);
  });

  ctx.strokeStyle = "#d9e2ec";
  ctx.lineWidth = 1;
  for (let scoreIndex = 0; scoreIndex <= yMax; scoreIndex += 1) {
    const y = getY(scoreIndex);
    ctx.beginPath();
    ctx.moveTo(chartLeft, y);
    ctx.lineTo(chartRight, y);
    ctx.stroke();

    ctx.fillStyle = "#6b7e74";
    ctx.font = "18px Helvetica";
    ctx.fillText(String(scoreIndex), chartLeft - 34, y + 5);
  }

  ticks.forEach((tick) => {
    const x = getX(tick.value);
    ctx.strokeStyle = "#edf2f7";
    ctx.beginPath();
    ctx.moveTo(x, chartTop);
    ctx.lineTo(x, chartBottom);
    ctx.stroke();
  });

  ctx.strokeStyle = "#8fa8a0";
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(chartLeft, chartTop);
  ctx.lineTo(chartLeft, chartBottom);
  ctx.lineTo(chartRight, chartBottom);
  ctx.stroke();

  const drawLine = (points, color) => {
    if (!points.length) return;
    const sorted = [...points].sort((a, b) => a.time - b.time);
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(getX(sorted[0].time), getY(sorted[0].score));
    for (let index = 1; index < sorted.length; index += 1) {
      ctx.lineTo(getX(sorted[index].time), getY(sorted[index].score));
    }
    ctx.stroke();
  };

  drawLine(seriesA, PDF_SERIES_COLORS.teamA);
  drawLine(seriesB, PDF_SERIES_COLORS.teamB);

  scoringPoints.forEach((point) => {
    const x = getX(point.time);
    const y = getY(point.score);
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, chartBottom);
    ctx.stroke();

    ctx.fillStyle = PDF_SERIES_COLORS[point.team] || "#64748b";
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  if (possessionSegments.length) {
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(chartLeft, possessionBandTop, chartWidth, possessionBandHeight);
    possessionSegments.forEach((segment) => {
      const startX = getX(segment.start);
      const endX = getX(segment.end);
      ctx.fillStyle =
        segment.team === "teamA"
          ? PDF_SERIES_COLORS.teamA
          : segment.team === "teamB"
            ? PDF_SERIES_COLORS.teamB
            : segment.team === "band"
              ? "#94a3b8"
              : "#e2e8f0";
      ctx.fillRect(startX, possessionBandTop, Math.max(2, endX - startX), possessionBandHeight);
    });
  }

  ticks.forEach((tick) => {
    const x = getX(tick.value);
    ctx.fillStyle = "#8ea49a";
    ctx.font = "18px Helvetica";
    ctx.textAlign = "center";
    ctx.fillText(tick.label, x, possessionBandBottom + 26);
  });
  ctx.textAlign = "left";

  ctx.fillStyle = "#e7f6ed";
  ctx.font = "bold 18px Helvetica";
  ctx.fillText("Score", 28, chartTop + 6);
  ctx.fillText("Minutes", width / 2 - 30, height - 56);

  const legendItems = [
    { label: labelA, color: PDF_SERIES_COLORS.teamA },
    { label: labelB, color: PDF_SERIES_COLORS.teamB },
    { label: "Timeout", color: "#dbeafe" },
    { label: "Stoppage", color: "#fecaca" },
    { label: "Halftime", color: "#dcfce7" },
  ];

  let legendX = chartLeft;
  let legendY = height - 106;
  legendItems.forEach((item, index) => {
    if (index === 2) {
      legendX = chartLeft + 520;
      legendY = height - 106;
    }

    ctx.fillStyle = item.color;
    ctx.fillRect(legendX, legendY - 10, 28, 10);
    ctx.strokeStyle = "#15362c";
    ctx.lineWidth = 0.8;
    ctx.strokeRect(legendX, legendY - 10, 28, 10);

    ctx.fillStyle = "#dff2e9";
    ctx.font = "bold 18px Helvetica";
    ctx.fillText(item.label, legendX + 38, legendY - 1.5);
    legendY += 26;
  });

  return canvas.toDataURL("image/png");
}

function drawTimelinePage(doc, { report, teamAName, teamBName, scoreA, scoreB }) {
  let y = drawPageHeader(doc, {
    eyebrow: "MATCH FLOW",
    title: "Score progression",
    subtitle: "Full timeline with score movement, event bands, and possession control.",
    rightTag: "Timeline",
  });

  const contentWidth = getContentWidth(doc);
  drawRoundedPanel(doc, {
    x: PAGE_MARGIN,
    y,
    width: contentWidth,
    height: 132,
    fill: PDF_THEME.card,
    border: PDF_THEME.border,
  });

  const chartImage = drawReportTimelineImage({
    report,
    teamAName,
    teamBName,
    scoreA,
    scoreB,
  });

  if (chartImage) {
    doc.addImage(chartImage, "PNG", PAGE_MARGIN + 1.5, y + 1.5, contentWidth - 3, 118);
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...PDF_THEME.inkMuted);
    doc.text("Unable to render score progression.", PAGE_MARGIN + 4, y + 12);
  }

  y += 136;
  y = drawKpiStrip(doc, {
    y,
    items: [
      { label: "Final score", value: `${scoreA} - ${scoreB}` },
      { label: "Score range", value: safeNumber(report?.timeline?.maxScore, "--") },
      { label: "Possession band", value: report?.possessionTimeline?.segments?.length ? "Available" : "No data" },
    ],
  });

  return y;
}

function drawMetricStrip(doc, { y, summary }) {
  return drawKpiStrip(doc, {
    y,
    items: [
      { label: "Holds", value: safeNumber(summary?.production?.holds) },
      { label: "Clean holds", value: safeNumber(summary?.production?.cleanHolds) },
      { label: "Turnovers", value: safeNumber(summary?.production?.totalTurnovers) },
      { label: "Breaks", value: safeNumber(summary?.production?.breaks) },
      { label: "Break chances", value: safeNumber(summary?.production?.breakChances) },
    ],
  });
}

function drawDualPlayerTables(doc, { y, leftTitle, leftRows, rightTitle, rightRows }) {
  const contentWidth = getContentWidth(doc);
  const gap = 4;
  const columnWidth = (contentWidth - gap) / 2;
  const leftBody = leftRows;
  const rightBody = rightRows;
  const leftHeight = getTableBlockHeight(leftBody.length, 6.5, 20, 8);
  const rightHeight = getTableBlockHeight(rightBody.length, 6.5, 20, 8);
  const tableY = y + 6;

  drawSectionLabel(doc, "Player production", y);

  drawRoundedPanel(doc, {
    x: PAGE_MARGIN,
    y: y + 2.5,
    width: columnWidth,
    height: leftHeight,
  });
  drawRoundedPanel(doc, {
    x: PAGE_MARGIN + columnWidth + gap,
    y: y + 2.5,
    width: columnWidth,
    height: rightHeight,
  });

  const leftTheme = buildTableTheme();
  autoTable(doc, {
    startY: tableY,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN + columnWidth + gap },
    tableWidth: columnWidth,
    head: [[leftTitle, leftTitle.charAt(0)]],
    body: leftBody,
    ...leftTheme,
    columnStyles: {
      0: { cellWidth: columnWidth - 16 },
      1: { cellWidth: 16, halign: "center" },
    },
  });
  const leftFinalY = doc.lastAutoTable?.finalY || tableY;

  const rightTheme = buildTableTheme();
  autoTable(doc, {
    startY: tableY,
    margin: { left: PAGE_MARGIN + columnWidth + gap, right: PAGE_MARGIN },
    tableWidth: columnWidth,
    head: [[rightTitle, rightTitle.charAt(0)]],
    body: rightBody,
    ...rightTheme,
    columnStyles: {
      0: { cellWidth: columnWidth - 16 },
      1: { cellWidth: 16, halign: "center" },
    },
  });
  const rightFinalY = doc.lastAutoTable?.finalY || tableY;

  return Math.max(leftFinalY, rightFinalY, y + 2.5 + leftHeight, y + 2.5 + rightHeight) + 4;
}

function drawSingleTableSection(doc, { y, title, head, body, columnStyles, minHeight = 20 }) {
  const contentWidth = getContentWidth(doc);
  const height = getTableBlockHeight(body.length, 6.8, minHeight, 8);
  const tableY = y + 6;

  drawSectionLabel(doc, title, y);
  drawRoundedPanel(doc, {
    x: PAGE_MARGIN,
    y: y + 2.5,
    width: contentWidth,
    height,
  });

  const theme = buildTableTheme();
  autoTable(doc, {
    startY: tableY,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    head: [head],
    body,
    ...theme,
    columnStyles,
  });

  return Math.max(doc.lastAutoTable?.finalY || tableY, y + 2.5 + height) + 4;
}

function drawTeamPage(doc, { teamName, summary }) {
  let y = drawPageHeader(doc, {
    eyebrow: "TEAM OUTPUT",
    title: `${teamName} overview`,
    subtitle: "Production, errors, and top passing combinations.",
    rightTag: "Live Stats",
  });

  y = drawMetricStrip(doc, { y, summary });
  y = drawDualPlayerTables(doc, {
    y,
    leftTitle: "Goals",
    leftRows: toPlayerRows(summary?.goals),
    rightTitle: "Assists",
    rightRows: toPlayerRows(summary?.assists),
  });

  y = drawSingleTableSection(doc, {
    y,
    title: "Possession errors",
    head: ["Turnovers", "T"],
    body: toPlayerRows(summary?.turnovers),
    columnStyles: {
      0: { cellWidth: 120 },
      1: { cellWidth: 28, halign: "center" },
    },
  });

  y = drawSingleTableSection(doc, {
    y,
    title: "Top connections",
    head: ["Assist", "Scorer", "Count"],
    body: toConnectionRows(summary?.connections),
    columnStyles: {
      0: { cellWidth: 68 },
      1: { cellWidth: 68 },
      2: { cellWidth: 22, halign: "center" },
    },
  });

  const maxY = getPageHeight(doc) - PAGE_FOOTER_SPACE;
  if (y < maxY - 10) {
    drawRoundedPanel(doc, {
      x: PAGE_MARGIN,
      y: y + 1,
      width: getContentWidth(doc),
      height: Math.max(10, maxY - y - 1),
      fill: PDF_THEME.cardSoft,
      border: PDF_THEME.border,
    });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...PDF_THEME.inkMuted);
    doc.text("End of team section", PAGE_MARGIN + 4, y + 7);
  }
}

export function downloadScrimmageReportPdf({
  report,
  teamAName,
  teamBName,
  score,
  startTime,
}) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const safeTeamA = safeText(teamAName, "Team A");
  const safeTeamB = safeText(teamBName, "Team B");
  const scoreA = Number.isFinite(score?.a) ? score.a : 0;
  const scoreB = Number.isFinite(score?.b) ? score.b : 0;
  const generatedLabel = formatDateTime(new Date());

  paintPageBackground(doc);
  drawHeroPage(doc, {
    report,
    teamAName: safeTeamA,
    teamBName: safeTeamB,
    scoreA,
    scoreB,
    generatedLabel,
  });

  addThemedPage(doc);
  drawTimelinePage(doc, {
    report,
    teamAName: safeTeamA,
    teamBName: safeTeamB,
    scoreA,
    scoreB,
  });

  addThemedPage(doc);
  drawTeamPage(doc, {
    teamName: safeTeamA,
    summary: report?.summaries?.teamA,
  });

  addThemedPage(doc);
  drawTeamPage(doc, {
    teamName: safeTeamB,
    summary: report?.summaries?.teamB,
  });

  decoratePages(doc);

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "_");
  const prefix = `${sanitizeFilePart(safeTeamA)}_vs_${sanitizeFilePart(safeTeamB)}`;
  const startStamp = startTime ? `_${safeText(startTime, "").replace(/[: ]/g, "_")}` : "";
  doc.save(`match_report_${prefix}_${stamp}${startStamp}.pdf`);
}
