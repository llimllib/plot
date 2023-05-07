import {select} from "d3";
import {create} from "../context.js";
import {formatDefault} from "../format.js";
import {Mark} from "../mark.js";
import {maybeFrameAnchor, maybeKeyword, maybeTuple, number, string} from "../options.js";
import {applyChannelStyles, applyDirectStyles, applyIndirectStyles} from "../style.js";
import {applyFrameAnchor, applyTransform} from "../style.js";
import {template} from "../template.js";
import {inferTickFormat} from "./axis.js";
import {applyIndirectTextStyles, cut, defaultWidth, monospaceWidth} from "./text.js";

const defaults = {
  ariaLabel: "tip",
  fill: "white",
  stroke: "currentColor"
};

export class Tip extends Mark {
  constructor(data, options = {}) {
    const {
      x,
      y,
      x1,
      x2,
      y1,
      y2,
      anchor,
      monospace,
      fontFamily = monospace ? "ui-monospace, monospace" : undefined,
      fontSize,
      fontStyle,
      fontVariant,
      fontWeight,
      lineHeight = 1,
      lineWidth = 20,
      frameAnchor
    } = options;
    super(
      data,
      {
        x: {value: x1 != null && x2 != null ? null : x, scale: "x", optional: true}, // ignore midpoint
        y: {value: y1 != null && y2 != null ? null : y, scale: "y", optional: true}, // ignore midpoint
        x1: {value: x1, scale: "x", optional: x2 == null},
        y1: {value: y1, scale: "y", optional: y2 == null},
        x2: {value: x2, scale: "x", optional: x1 == null},
        y2: {value: y2, scale: "y", optional: y1 == null}
      },
      options,
      defaults
    );
    this.anchor = maybeAnchor(anchor);
    this.frameAnchor = maybeFrameAnchor(frameAnchor);
    this.textAnchor = "start"; // TODO option
    this.lineHeight = +lineHeight;
    this.lineWidth = +lineWidth;
    this.monospace = !!monospace;
    this.fontFamily = string(fontFamily);
    this.fontSize = number(fontSize);
    this.fontStyle = string(fontStyle);
    this.fontVariant = string(fontVariant);
    this.fontWeight = string(fontWeight);
  }
  render(index, scales, channels, dimensions, context) {
    const mark = this;
    const {x, y, fx, fy} = scales;
    const {x: X, y: Y, stroke: S} = channels; // TODO X1, Y1, X2, Y2
    const [cx, cy] = applyFrameAnchor(this, dimensions);
    const {ownerSVGElement: svg, document} = context;
    const {stroke, anchor, monospace, lineHeight, lineWidth} = this;
    const {marginTop, marginLeft} = dimensions;
    const widthof = monospace ? monospaceWidth : defaultWidth;
    const ellipsis = "…";
    const ee = widthof(ellipsis);
    const r = 8; // “padding”
    const m = 12; // “margin” (flag size)
    const labelFx = fx && (fx.label === undefined ? "fx" : fx.label);
    const labelFy = fy && (fy.label === undefined ? "fy" : fy.label);
    const formatFx = fx && inferTickFormat(fx);
    const formatFy = fy && inferTickFormat(fy);

    const g = create("svg:g", context)
      .call(applyIndirectStyles, this, dimensions, context)
      .call(applyIndirectTextStyles, this)
      .call(applyTransform, this, {x: X && x, y: Y && y})
      .call((g) =>
        g
          .selectAll()
          .data(index)
          .enter()
          .append("g")
          .attr("transform", template`translate(${X ? (i) => X[i] : cx},${Y ? (i) => Y[i] : cy})`)
          .call(applyDirectStyles, this)
          .call(applyChannelStyles, this, channels)
          .call((g) => g.append("path").attr("filter", "drop-shadow(0 3px 4px rgba(0,0,0,0.2))"))
          .call((g) =>
            g.append("text").each(function (i) {
              const that = select(this);
              this.setAttribute("fill", S ? S[i] : stroke);
              this.setAttribute("stroke", "none");
              for (const key in channels.channels) {
                const channel = getSource(channels.channels, key);
                if (!channel) continue; // e.g., dodgeY’s y
                renderLine(that, scales[channel.scale]?.label ?? key, formatDefault(channel.value[i]));
              }
              if (fx) renderLine(that, labelFx, formatFx(index.fx));
              if (fy) renderLine(that, labelFy, formatFy(index.fy));
            })
          )
      );

    function renderLine(that, name, value) {
      let title;
      let w = lineWidth * 100;
      const [j] = cut(name, w, widthof, ee);
      if (j >= 0) {
        // name is truncated
        name = name.slice(0, j).trimEnd() + ellipsis;
        value = "";
        title = value.trim();
      } else {
        value = ` ${value}\u200b`; // zwsp for double-click
        const [k] = cut(value, w - widthof(name), widthof, ee);
        if (k >= 0) {
          // value is truncated
          value = value.slice(0, k).trimEnd() + ellipsis;
          title = value.trim();
        }
      }
      const line = that.append("tspan").attr("x", 0).attr("dy", `${lineHeight}em`);
      line.append("tspan").attr("font-weight", "bold").text(name);
      if (value) line.append(() => document.createTextNode(value));
      if (title) line.append("title").text(title);
    }

    function postrender() {
      const {width, height} = svg.getBBox();
      const ox = fx ? fx(index.fx) - marginLeft : 0;
      const oy = fy ? fy(index.fy) - marginTop : 0;
      g.selectChildren().each(function (i) {
        const x = (X ? X[i] : cx) + ox;
        const y = (Y ? Y[i] : cy) + oy;
        const {width: w, height: h} = this.getBBox();
        let a = anchor;
        if (a === undefined) {
          a = mark.previousAnchor;
          const fitLeft = x + w + r * 2 < width;
          const fitRight = x - w - r * 2 > 0;
          const fitTop = y + h + m + r * 2 + 7 < height;
          const fitBottom = y - h - m - r * 2 > 0;
          const ax = (/-left$/.test(a) ? fitLeft || !fitRight : fitLeft && !fitRight) ? "left" : "right";
          const ay = (/^top-/.test(a) ? fitTop || !fitBottom : fitTop && !fitBottom) ? "top" : "bottom";
          a = mark.previousAnchor = `${ay}-${ax}`;
        }
        const path = this.firstChild;
        const text = this.lastChild;
        path.setAttribute("d", getPath(a, m, r, w, h));
        text.setAttribute("y", `${+getLineOffset(a, text.childNodes.length, lineHeight).toFixed(6)}em`);
        text.setAttribute("transform", getTextTransform(a, m, r, w, h));
      });
    }

    // Wait until the Plot is inserted into the page, so that we can use getBBox
    // to compute the text dimensions. Perhaps this could be done synchronously;
    // getting the dimensions of the SVG is easy, and although accurate text
    // metrics are hard, we could use approximate heuristics.
    if (svg.isConnected) Promise.resolve().then(postrender);
    else if (typeof requestAnimationFrame !== "undefined") requestAnimationFrame(postrender);

    return g.node();
  }
}

export function tip(data, {x, y, ...options} = {}) {
  if (options.frameAnchor === undefined) [x, y] = maybeTuple(x, y);
  return new Tip(data, {...options, x, y});
}

function maybeAnchor(value) {
  return maybeKeyword(value, "anchor", ["top-left", "top-right", "bottom-right", "bottom-left"]);
}

function getSource(channels, key) {
  let channel = channels[key];
  if (!channel) return;
  while (channel.source) channel = channel.source;
  return channel.source === null ? null : channel;
}

function getLineOffset(anchor, length, lineHeight) {
  return /^top-/.test(anchor) ? 0.94 - lineHeight : -0.29 - length * lineHeight;
}

function getTextTransform(anchor, m, r, width) {
  const x = /-left$/.test(anchor) ? r : -width - r;
  const y = /^top-/.test(anchor) ? m + r : -m - r;
  return `translate(${x},${y})`;
}

function getPath(anchor, m, r, width, height) {
  const w = width + r * 2;
  const h = height + r * 2;
  switch (anchor) {
    case "top-left":
      return `M0,0l${m},${m}h${w - m}v${h}h${-w}z`;
    case "top-right":
      return `M0,0l${-m},${m}h${m - w}v${h}h${w}z`;
    case "bottom-left":
      return `M0,0l${m},${-m}h${w - m}v${-h}h${-w}z`;
    case "bottom-right":
      return `M0,0l${-m},${-m}h${m - w}v${-h}h${w}z`;
  }
}