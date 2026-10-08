import { SPIRIT_DIMENSIONS, SPIRIT_MAX_SCORE } from "../utils/spirit";

const TONE_STYLES = {
  teamA: { stroke: "#1d4ed8", fill: "rgba(29, 78, 216, 0.18)" },
  teamB: { stroke: "#b91c1c", fill: "rgba(185, 28, 28, 0.18)" },
};

/**
 * Spirit radar: one polygon for `values` ({ [dimensionKey]: 0-4 }). `large`
 * switches to the roomier layout (short axis labels, bigger plot, no per-axis
 * numbers); otherwise per-axis values are rounded to `valueDigits`.
 */
export default function SpiritRadarChart({
  values,
  tone,
  title,
  totalLabel,
  valueDigits = 0,
  showBaseline = true,
  large = false,
}) {
  const width = large ? 360 : 330;
  const height = large ? 315 : 235;
  const centerX = width / 2;
  const centerY = large ? height / 2 + 2 : height / 2 + 12;
  const radius = large ? 112 : 86;
  const labelFont = large ? 13 : 10;
  const centerR = large ? 21 : 16;
  const levels = 4;
  const count = SPIRIT_DIMENSIONS.length;
  const { stroke: toneColor, fill: fillColor } = TONE_STYLES[tone] || TONE_STYLES.teamA;
  const formatValue = (raw) => (Number.isFinite(raw) ? raw.toFixed(valueDigits) : "--");
  const gridColor = "#e2e8f0";
  const emphasisColor = "#00a30e";
  const axisColor = "#cbd5f5";
  const labelColor = "#475569";
  const labelMaxChars = 14;
  const labelMaxLines = 3;
  const valueLabelColor = toneColor;
  const titleMaxChars = 18;

  const rotationStep = (Math.PI * 2) / count;
  const getAngle = (index) => (Math.PI * 2 * index) / count - Math.PI / 2 + rotationStep;
  const getPoint = (angle, ratio) => ({
    x: centerX + Math.cos(angle) * radius * ratio,
    y: centerY + Math.sin(angle) * radius * ratio,
  });

  const buildPolygon = (ratio) =>
    SPIRIT_DIMENSIONS.map((_, index) => {
      const angle = getAngle(index);
      const point = getPoint(angle, ratio);
      return `${point.x},${point.y}`;
    }).join(" ");

  const wrapLabel = (label) => {
    if (!label) return [""];
    const words = label.split(" ");
    const lines = [];
    let current = "";
    words.forEach((word) => {
      const next = current ? `${current} ${word}` : word;
      if (next.length <= labelMaxChars || current.length === 0) {
        current = next;
      } else {
        lines.push(current);
        current = word;
      }
    });
    if (current) lines.push(current);
    if (lines.length <= labelMaxLines) return lines;
    const trimmed = lines.slice(0, labelMaxLines);
    const overflow = lines.slice(labelMaxLines).join(" ");
    const last = `${trimmed[labelMaxLines - 1]} ${overflow}`.trim();
    if (last.length <= labelMaxChars) {
      trimmed[labelMaxLines - 1] = last;
      return trimmed;
    }
    trimmed[labelMaxLines - 1] = `${last.slice(0, Math.max(0, labelMaxChars - 3))}...`;
    return trimmed;
  };

  const buildDataPolygon = (source) =>
    SPIRIT_DIMENSIONS.map((dim, index) => {
      const raw = source?.[dim.key];
      const value = Number.isFinite(raw) ? raw : 0;
      const ratio = Math.max(0, Math.min(1, value / SPIRIT_MAX_SCORE));
      const point = getPoint(getAngle(index), ratio);
      return `${point.x},${point.y}`;
    }).join(" ");
  const dataPolygon = buildDataPolygon(values);

  const wrapTitle = (text) => {
    if (!text) return [""];
    const words = text.split(" ");
    const lines = [];
    let current = "";
    words.forEach((word) => {
      const next = current ? `${current} ${word}` : word;
      if (next.length <= titleMaxChars || current.length === 0) {
        current = next;
      } else {
        lines.push(current);
        current = word;
      }
    });
    if (current) lines.push(current);
    return lines.slice(0, 2);
  };

  const titleLines = large ? [] : wrapTitle(title);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      <rect x="0" y="0" width={width} height={height} fill="white" rx="16" />
      <g>
        {titleLines.map((line, index) => (
          <text
            key={`title-${index}`}
            x={12}
            y={16 + index * 12}
            fontSize="10.5"
            fontWeight="600"
            fill="#0f172a"
            textAnchor="start"
          >
            {line}
          </text>
        ))}
      </g>
      {Array.from({ length: levels }).map((_, index) => {
        const ratio = (index + 1) / levels;
        const isEmphasis = showBaseline && index === 1;
        return (
          <polygon
            key={`grid-${ratio}`}
            points={buildPolygon(ratio)}
            fill="none"
            stroke={isEmphasis ? emphasisColor : gridColor}
            strokeWidth={isEmphasis ? 1 : 1}
          />
        );
      })}
      {SPIRIT_DIMENSIONS.map((dim, index) => {
        const angle = getAngle(index);
        const end = getPoint(angle, 1);
        const label = getPoint(angle, large ? 1.1 : 1.08);
        const margin = large ? 6 : 10;
        let labelX = label.x;
        let labelY = label.y;
        let anchor =
          Math.cos(angle) > 0.2 ? "start" : Math.cos(angle) < -0.2 ? "end" : "middle";
        if (labelX > width - margin) {
          labelX = width - margin;
          anchor = "end";
        } else if (labelX < margin) {
          labelX = margin;
          anchor = "start";
        }
        if (labelY < margin) {
          labelY = margin;
        } else if (labelY > height - margin) {
          labelY = height - margin;
        }
        const lines = large ? [dim.short] : wrapLabel(dim.label);
        return (
          <g key={dim.key}>
            <line
              x1={centerX}
              y1={centerY}
              x2={end.x}
              y2={end.y}
              stroke={axisColor}
              strokeWidth="1"
            />
            <text
              x={labelX}
              y={labelY}
              fontSize={labelFont}
              fill={labelColor}
              textAnchor={anchor}
            >
              {lines.map((line, lineIndex) => (
                <tspan
                  key={`${dim.key}-line-${lineIndex}`}
                  x={labelX}
                  dy={lineIndex === 0 ? "0" : labelFont + 1}
                >
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}
      <polygon
        points={dataPolygon}
        fill={fillColor}
        stroke={toneColor}
        strokeWidth={large ? 2.5 : 2}
      />
      <g>
        <circle cx={centerX} cy={centerY} r={centerR} fill="white" stroke={axisColor} strokeWidth="1" />
        <text
          x={centerX}
          y={centerY}
          fontSize={large ? 14 : 11}
          fontWeight="600"
          fill={toneColor}
          textAnchor="middle"
          dominantBaseline="central"
          dy="0.0em"
        >
          {totalLabel}
        </text>
      </g>
      {SPIRIT_DIMENSIONS.map((dim, index) => {
        const raw = values?.[dim.key];
        const value = Number.isFinite(raw) ? raw : 0;
        const ratio = Math.max(0, Math.min(1, value / SPIRIT_MAX_SCORE));
        const angle = getAngle(index);
        const point = getPoint(angle, ratio);
        const labelPoint = getPoint(angle, Math.min(1.08, ratio + 0.12));
        const anchor =
          Math.cos(angle) > 0.2 ? "start" : Math.cos(angle) < -0.2 ? "end" : "middle";
        return (
          <g key={`dot-${dim.key}`}>
            <circle
              cx={point.x}
              cy={point.y}
              r="3"
              fill={toneColor}
              stroke="white"
              strokeWidth="1"
            />
            {large ? null : (
            <text
              x={labelPoint.x}
              y={labelPoint.y}
              fontSize="9.5"
              fill={valueLabelColor}
              textAnchor={anchor}
              dominantBaseline="middle"
            >
              {formatValue(raw)}
            </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
