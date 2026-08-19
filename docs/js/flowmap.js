/* ==========================================================================
   Acordos Internacionais — globo 3D: Manaus -> países parceiros, por continente
   ========================================================================== */
function initFlowGlobe(el, { paisesGeo, manaus, continentColor, world, onSelect }) {
  const destinos = paisesGeo.filter((d) => d.lat != null && d.lon != null);

  const maxV = d3.max(destinos, (d) => d.n_acordos) || 1;
  let widthScale, dotScale;
  function computeScales() {
    widthScale = d3.scaleSqrt().domain([1, maxV]).range([1.2, 5]);
    dotScale = d3.scaleSqrt().domain([1, maxV]).range([3, 10]);
  }
  computeScales();

  let projection, path, baseScale, minScale, maxScale;
  let svg, arcs, dots, originG, originLabel;
  let justDragged = false;
  let active = null; // país selecionado (persiste entre rebuilds: resize/tema)

  build();
  const debouncedBuild = debounce(build, 200);
  window.addEventListener("resize", debouncedBuild);
  window.addEventListener("acordos:themechange", build);

  function build() {
    const width = el.clientWidth, height = el.clientHeight;
    d3.select(el).selectAll("*").remove();
    if (width < 10 || height < 10) return;

    const midLon = (manaus.lon + d3.mean(destinos, (d) => d.lon)) / 2;
    const midLat = (manaus.lat + d3.mean(destinos, (d) => d.lat)) / 2;

    projection = d3.geoOrthographic().rotate([-midLon, -midLat]).clipAngle(90);
    const points = {
      type: "MultiPoint",
      coordinates: [[manaus.lon, manaus.lat], ...destinos.map((d) => [d.lon, d.lat])],
    };
    projection.fitExtent([[36, 30], [width - 36, height - 30]], points);
    path = d3.geoPath(projection);
    baseScale = projection.scale();
    minScale = baseScale * 0.55;
    maxScale = baseScale * 5;

    svg = d3.select(el).append("svg").attr("width", width).attr("height", height)
      .attr("class", "flow-globe")
      .on("click", () => { if (!justDragged) setActive(null); });

    svg.append("path").attr("class", "map-sphere");
    svg.append("path").attr("class", "map-graticule");
    svg.append("g").selectAll("path.country")
      .data(world.features)
      .join("path")
      .attr("class", "map-country")
      .attr("fill", CHART_MAP_FILL)
      .attr("stroke", CHART_MAP_BORDER)
      .attr("stroke-width", 1);

    const arcG = svg.append("g");
    arcs = arcG.selectAll("path.flow-arc")
      .data(destinos)
      .join("path")
      .attr("class", "flow-arc")
      .attr("stroke", (d) => continentColor.get(d.continente))
      .attr("stroke-width", (d) => widthScale(d.n_acordos))
      .attr("stroke-opacity", 0.8)
      .attr("stroke-linecap", "round");

    const dotsG = svg.append("g");
    dots = dotsG.selectAll("circle.flow-dot-dest")
      .data(destinos)
      .join("circle")
      .attr("class", "flow-dot-dest")
      .attr("r", (d) => dotScale(d.n_acordos))
      .attr("fill", (d) => continentColor.get(d.continente))
      .attr("stroke", CHART_MAP_BORDER)
      .attr("stroke-width", 1.4);

    originG = svg.append("g");
    originG.append("circle").attr("class", "flow-dot-origin").attr("r", 6);
    originG.append("circle").attr("r", 6).attr("fill", "none")
      .attr("stroke", CHART_NODE_NEUTRAL).attr("stroke-width", 1.4).attr("opacity", 0.5)
      .append("animate").attr("attributeName", "r").attr("values", "6;20;6").attr("dur", "3s").attr("repeatCount", "indefinite");
    originG.append("circle").attr("r", 6).attr("fill", "none")
      .attr("stroke", CHART_NODE_NEUTRAL).attr("stroke-width", 1.4)
      .append("animate").attr("attributeName", "opacity").attr("values", "0.5;0;0.5").attr("dur", "3s").attr("repeatCount", "indefinite");
    originLabel = svg.append("text").attr("text-anchor", "middle").attr("class", "bar-label")
      .style("font-weight", 800).text("Manaus");

    arcs
      .on("mousemove", (ev, d) => {
        showTooltip(ev.clientX, ev.clientY,
          `<b>${d.pais}</b><br>${d.continente}<br>${fmt(d.n_acordos)} acordo(s) · ${fmt(d.n_ativos)} vigente(s)`);
        ev.stopPropagation();
      })
      .on("mouseleave", hideTooltip)
      .on("click", (ev, d) => { ev.stopPropagation(); setActive(d); });
    dots
      .on("mousemove", (ev, d) => {
        showTooltip(ev.clientX, ev.clientY,
          `<b>${d.pais}</b><br>${d.continente}<br>${fmt(d.n_acordos)} acordo(s) · ${fmt(d.n_ativos)} vigente(s)`);
        ev.stopPropagation();
      })
      .on("mouseleave", hideTooltip)
      .on("click", (ev, d) => { ev.stopPropagation(); setActive(d); });

    attachInteraction();
    redraw();
    highlight();
  }

  function setActive(d) {
    active = d;
    highlight();
    onSelect && onSelect(active);
  }

  function highlight() {
    if (!arcs) return;
    arcs.classed("is-dim", (d) => active && d.pais !== active.pais);
    dots.attr("opacity", (d) => (!active || d.pais === active.pais ? 1 : 0.25));
  }

  function attachInteraction() {
    const ROTATE_SENSITIVITY = 60;
    const drag = d3.drag()
      .on("start", () => { justDragged = false; svg.classed("is-grabbing", true); })
      .on("drag", (ev) => {
        if (Math.abs(ev.dx) + Math.abs(ev.dy) > 1) justDragged = true;
        const k = ROTATE_SENSITIVITY / projection.scale();
        const r = projection.rotate();
        const nextLat = Math.max(-89, Math.min(89, r[1] - ev.dy * k));
        projection.rotate([r[0] + ev.dx * k, nextLat]);
        redraw();
      })
      .on("end", () => {
        svg.classed("is-grabbing", false);
        if (justDragged) hideTooltip();
      });
    svg.call(drag);

    svg.on("wheel", (ev) => {
      ev.preventDefault();
      const factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
      const next = Math.max(minScale, Math.min(maxScale, projection.scale() * factor));
      projection.scale(next);
      redraw();
    }, { passive: false });
  }

  function redraw() {
    const rotate = projection.rotate();
    const visible = (lon, lat) => d3.geoDistance([lon, lat], [-rotate[0], -rotate[1]]) < Math.PI / 2 - 0.02;

    svg.select("path.map-sphere").attr("d", path({ type: "Sphere" }));
    svg.select("path.map-graticule").attr("d", path(d3.geoGraticule10()));
    svg.selectAll("path.map-country").attr("d", path);

    arcs.attr("d", (d) => path({
      type: "LineString",
      coordinates: interpolatedLine([manaus.lon, manaus.lat], [d.lon, d.lat]),
    }));

    dots
      .style("display", (d) => (visible(d.lon, d.lat) ? null : "none"))
      .attr("cx", (d) => projection([d.lon, d.lat])[0])
      .attr("cy", (d) => projection([d.lon, d.lat])[1]);

    const originXY = projection([manaus.lon, manaus.lat]);
    originG.attr("transform", `translate(${originXY[0]},${originXY[1]})`);
    originLabel.attr("x", originXY[0]).attr("y", originXY[1] - 14)
      .style("display", visible(manaus.lon, manaus.lat) ? null : "none");
  }

  function interpolatedLine(a, b) {
    const interp = d3.geoInterpolate(a, b);
    const dist = d3.geoDistance(a, b);
    const n = Math.max(2, Math.round(dist / 0.02));
    return d3.range(0, n + 1).map((i) => interp(i / n));
  }

  return {
    setActive,
    destroy: () => {
      window.removeEventListener("resize", debouncedBuild);
      window.removeEventListener("acordos:themechange", build);
    },
  };
}

let _worldCache = null;
async function getWorld() {
  if (!_worldCache) {
    const topo = await fetch("lib/countries-110m.json").then((r) => r.json());
    _worldCache = topojson.feature(topo, topo.objects.countries);
  }
  return _worldCache;
}
