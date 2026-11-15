/* Motor de animación determinista para las láminas de video de explorarg (noviembre de 2026).
   Se inyecta en la maqueta HTML junto con window.__PLAN y expone window.__anim:
     preparar()  -> arma las unidades (qué aparece en cada paso y en qué orden), las barras, los números y los sellos;
                    devuelve {unidades, efectos, intervalos} (los tramos de tiempo en los que algo se mueve).
     render(T)   -> deja la lámina exactamente como está en el segundo T (desde el inicio del segmento). Es una función pura
                    de T: el grabador la llama cuadro por cuadro y el resultado no depende de ningún reloj.
   Plan: { W, H, fps, dur, pasos:[{t, sel:[selectores] | "resto"}], entrada:"anterior"|"blanco"|"ninguna", t_entrada,
           salida_blanco, t_salida }.
   Regla de HDO: la pantalla lleva los hechos y las personas saben leer. La animación construye los datos (las barras crecen
   hasta su valor, las cifras cuentan, el sello cae) y nada más: sobria y corta, para que el texto esté quieto casi siempre.
   Con T >= dur la lámina queda idéntica a la maqueta quieta (los estilos tocados se restauran). */
(function () {
  const P = window.__PLAN;
  const T_APARECE = 0.45, T_BARRAS = 0.75, T_CUENTA = 0.8, T_SELLO = 0.4, T_RESALTA = 0.45;
  // unidades: lo que aparece como un bloque en el modo "resto" (láminas sin data-paso: las de las series)
  const UNIDADES = ['.cab', '.examen', '.rot', '.cita', '.quien', '.contexto', '.pregunta', '.regla-test', '.cierra', '.bloque', '.remate',
    '.pie', '.titulo', '.sub', '.bajada', '.autores', '.resumen', '.tally', '.videos', '.veredicto', '.sellos', '.wf > *', '.anios > *',
    '.cuatro > *', '.tejas3 > *', '.dos > *', '.mini-t', '.unidad', '.nota', '.ley', '.tejas', '.fichas', '.linea', '.heroe', '.heroe-et'];
  // subunidades: dentro de una unidad, lo que se escalona (hasta tres niveles)
  const SUBS = ['h2', '.teja', '.ficha', '.hito', '.per', '.caja', '.dec', '.ley', '.dicho', '.mini', '.fila', '.cuenta', '.bar', '.anio', '.tabla > *',
    '.comp > *', '.sello', '.porque', '.autor', '.por', '.cubo', '.buque', '.lado', '[data-paso]', '.b1 > *', '.decisiones > *', '.tejas > *',
    '.fichas > *', '.linea > *', '.periodos > *', '.comp2 > *', '.resumen > *', '.tally > *', '.dos > *', '.caja .linea', '.nota', '.mini-t',
    '.det', '.bajo', '.pista2', '.tira', '.heroe', '.heroe-et', '.heroe-texto', '.topes', '.leyenda', '.efecto', '.unidad', '.marca-empate'];
  // contenedores: no tienen aparición propia, solo escalonan a sus hijos
  const CONTENEDORES = ['.veredicto', '.sellos', '.tally', '.resumen', '.autores', '.tejas', '.fichas', '.linea:not(.caja .linea)', '.periodos', '.comp2',
    '.decisiones', '.cuatro', '.anios', '.wf', '.dos', '.b1', '.comp', '.tabla', '.tejas3', '.pista2', '.tira', '.anio'];
  const BARRAS = '.barra:not(:has(i)), .barra > i, .pista2 > .b, .quita, .lleno, .hueco, .bar > .b';
  const NUMEROS = '.heroe, .v, .val, .total, .bar > .n, .d > b, .caja .linea > b, .manda, .pista2 > .b, .quita, .lleno, .sello > b, .anio .c b, .ex b';
  const RESALTA = '.ley p b';
  const ESCALON = [0.12, 0.09, 0.07], TOPE_ESCALON = [1.0, 0.7, 0.5];

  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const clamp = x => x < 0 ? 0 : x > 1 ? 1 : x;
  const easeOut = p => 1 - Math.pow(1 - p, 3);
  const easeBack = p => { const c = 1.4; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
  const matchesAny = (el, lista) => lista.some(s => { try { return el.matches(s); } catch (e) { return false; } });
  const sinAncestroEn = els => els.filter(e => !els.some(o => o !== e && o.contains(e)));
  const esContenedor = el => matchesAny(el, CONTENEDORES) || getComputedStyle(el).display === 'contents';

  const efectos = [];
  let unidades = 0, esPosterior = () => false;

  // ---------- aparición y escalonado
  function aparece(el, t0) { efectos.push({ tipo: 'aparece', el, t0, t1: t0 + T_APARECE }); return t0 + T_APARECE; }
  function sello(el, t0) { efectos.push({ tipo: 'sello', el, t0, t1: t0 + T_SELLO }); return t0 + T_SELLO; }

  // descompone una unidad en subunidades escalonadas y devuelve el tiempo en que termina de aparecer
  function descomponer(el, t0, nivel) {
    if (el.matches('.sello')) return sello(el, t0);
    const contenedor = esContenedor(el);
    let fin = contenedor ? t0 : aparece(el, t0);
    if (nivel >= ESCALON.length) return fin;
    let subs = getComputedStyle(el).display === 'contents' ? Array.from(el.children) : $$(SUBS.join(','), el);
    subs = sinAncestroEn(subs.filter(s => s !== el && !esPosterior(s)));
    if (!subs.length) return fin;
    const paso = subs.length > 1 ? Math.min(ESCALON[nivel], TOPE_ESCALON[nivel] / (subs.length - 1)) : 0;
    const base = t0 + (contenedor ? 0 : 0.1);
    subs.forEach((s, j) => { fin = Math.max(fin, descomponer(s, base + j * paso, nivel + 1)); });
    return fin;
  }

  // ---------- barras: dentro de una fila crecen de a una, a velocidad constante (el ancho reparte el tiempo)
  function armarBarras(g, t0) {
    const bs = Array.from(g.children).filter(b => b.matches(BARRAS));
    if (!bs.length) return t0;
    const anchos = bs.map(b => b.getBoundingClientRect().width);
    const total = anchos.reduce((a, b) => a + b, 0) || 1;
    let t = t0 + 0.12;
    const ini = t;
    bs.forEach((b, i) => {
      const d = Math.max(0.12, T_BARRAS * anchos[i] / total);
      efectos.push({ tipo: 'barra', el: b, t0: t, t1: t + d, w: anchos[i], estilo: { width: b.style.width, overflow: b.style.overflow }, conTexto: b.textContent.trim().length > 0 });
      t += d;
    });
    if (bs[0].matches('.barra > i')) {   // el contenedor .barra acompaña la suma de sus tramos
      const gap = parseFloat(getComputedStyle(g).columnGap) || 0;
      efectos.push({ tipo: 'barra-suma', el: g, tramos: bs, gap, estilo: { width: g.style.width }, t0: ini, t1: t });
    }
    return t;
  }

  // ---------- números: cuentan desde cero hasta la cifra escrita, con su formato (puntos de mil, coma decimal)
  const RE_NUM = /\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/g;
  function formatear(v, dec, miles) {
    let s = Math.round(v * Math.pow(10, dec)).toString();
    if (dec > 0) s = s.padStart(dec + 1, '0');
    let ip = dec > 0 ? s.slice(0, -dec) : s, fp = dec > 0 ? s.slice(-dec) : '';
    if (miles) ip = ip.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return ip + (dec > 0 ? ',' + fp : '');
  }
  function armarNumero(el, t0, hastaBarra) {
    const nodo = Array.from(el.childNodes).find(n => n.nodeType === 3 && /\d/.test(n.textContent));
    if (!nodo) return t0;
    const texto = nodo.textContent, tokens = texto.match(RE_NUM) || [];
    if (!tokens.length || tokens.length > 2) return t0;
    if (tokens.length === 2 && !/^\s*[+\-]?\s*(\$|USD)?\s*\d[\d.,]*\s+de\s+\d/.test(texto)) return t0;
    if (/[→\/:]/.test(texto)) return t0;
    const tok = tokens[0];
    if (/^(19|20)\d\d$/.test(tok)) return t0;                         // un año no se cuenta
    const miles = tok.includes('.'), dec = tok.includes(',') ? tok.split(',')[1].length : 0;
    const valor = parseFloat(tok.replace(/\./g, '').replace(',', '.'));
    if (!(valor > 0)) return t0;
    const barra = hastaBarra.get(el);
    const a = barra ? barra.t0 : t0 + 0.05, b = barra ? barra.t1 : t0 + 0.05 + T_CUENTA;
    efectos.push({ tipo: 'cuenta', el, nodo, texto, idx: texto.indexOf(tok), tok, valor, miles, dec, t0: a, t1: b });
    return b;
  }

  function armarResalte(el, t0) {
    const cs = getComputedStyle(el);
    efectos.push({ tipo: 'resalta', el, color: cs.backgroundColor, estilo: { bi: el.style.backgroundImage, bs: el.style.backgroundSize, br: el.style.backgroundRepeat, bc: el.style.backgroundColor }, t0: t0 + 0.3, t1: t0 + 0.3 + T_RESALTA });
    return t0 + 0.3 + T_RESALTA;
  }

  // ---------- plan: qué unidades tiene cada paso
  function unidadesDelPaso(k) {
    const paso = P.pasos[k];
    const posteriores = P.pasos.slice(k + 1).flatMap(p => Array.isArray(p.sel) ? p.sel.flatMap(s => $$(s)) : []);
    esPosterior = e => posteriores.some(q => q === e || q.contains(e));
    let cand;
    if (!Array.isArray(paso.sel)) cand = $$(UNIDADES.join(',')).filter(e => !esPosterior(e) && !posteriores.some(q => e.contains(q)));
    else cand = paso.sel.flatMap(s => $$(s)).filter(e => !esPosterior(e));
    return sinAncestroEn(Array.from(new Set(cand)));
  }

  function preparar() {
    const intervalos = [];
    P.pasos.forEach((paso, k) => {
      const us = unidadesDelPaso(k);
      const escalon = us.length > 1 ? Math.min(ESCALON[0], TOPE_ESCALON[0] / (us.length - 1)) : 0;
      let fin = paso.t;
      us.forEach((u, i) => { unidades++; fin = Math.max(fin, descomponer(u, paso.t + i * escalon, 0)); });
      // el inicio de un elemento es el de su dueño más cercano (la unidad o subunidad que lo contiene y aparece más tarde)
      const inicioDe = el => { let mejor = paso.t; for (const d of efectos) if ((d.tipo === 'aparece' || d.tipo === 'sello') && (d.el === el || d.el.contains(el)) && d.t0 > mejor) mejor = d.t0; return mejor; };
      const grupos = new Set();
      us.forEach(u => $$(BARRAS, u).forEach(b => grupos.add(b.parentElement)));
      grupos.forEach(g => { fin = Math.max(fin, armarBarras(g, inicioDe(g))); });
      const hastaBarra = new Map(efectos.filter(e => e.tipo === 'barra').map(e => [e.el, e]));
      const vistos = new Set();
      us.forEach(u => $$(NUMEROS, u).forEach(el => { if (vistos.has(el) || esPosterior(el)) return; vistos.add(el); fin = Math.max(fin, armarNumero(el, inicioDe(el), hastaBarra)); }));
      us.forEach(u => $$(RESALTA, u).forEach(el => { fin = Math.max(fin, armarResalte(el, inicioDe(el))); }));
      intervalos.push([paso.t, fin + 1 / P.fps]);
    });
    if (P.entrada !== 'ninguna') intervalos.push([0, P.t_entrada + 1 / P.fps]);
    if (P.salida_blanco) intervalos.push([P.dur - P.t_salida, P.dur]);
    intervalos.sort((a, b) => a[0] - b[0]);
    const fusion = [];
    intervalos.forEach(iv => { const u = fusion[fusion.length - 1]; if (u && iv[0] <= u[1]) u[1] = Math.max(u[1], iv[1]); else fusion.push([iv[0], iv[1]]); });
    return { unidades, efectos: efectos.length, intervalos: fusion };
  }

  // ---------- render
  const ovlPrev = document.getElementById('__ovl_prev'), ovlBlanco = document.getElementById('__ovl_blanco');
  function render(T) {
    for (const e of efectos) {
      const p = clamp((T - e.t0) / (e.t1 - e.t0));
      switch (e.tipo) {
        case 'aparece':
          if (p >= 1) { e.el.style.opacity = ''; e.el.style.transform = ''; }
          else { const q = easeOut(p); e.el.style.opacity = q.toFixed(3); e.el.style.transform = `translateY(${((1 - q) * 12).toFixed(2)}px)`; }
          break;
        case 'sello':
          if (p >= 1) { e.el.style.opacity = ''; e.el.style.transform = ''; }
          else { const q = easeBack(p); e.el.style.opacity = clamp(p * 2.2).toFixed(3); e.el.style.transform = `scale(${(1.45 - 0.45 * q).toFixed(4)})`; }
          break;
        case 'barra':
          // antes de su turno la barra no se ve (algunas tienen min-width o borde y asomarían con ancho 0)
          if (p >= 1) { e.el.style.width = e.estilo.width; e.el.style.overflow = e.estilo.overflow; e.el.style.visibility = ''; }
          else { e.el.style.width = (e.w * easeOut(p)).toFixed(2) + 'px'; if (e.conTexto) e.el.style.overflow = 'hidden'; e.el.style.visibility = p <= 0 ? 'hidden' : ''; }
          break;
        case 'barra-suma':
          if (p >= 1) e.el.style.width = e.estilo.width;
          else { let s = 0, vis = 0; e.tramos.forEach(t => { const w = parseFloat(t.style.width) || 0; if (w > 0) { s += w; vis++; } }); e.el.style.width = (s + Math.max(0, vis - 1) * e.gap).toFixed(2) + 'px'; }
          break;
        case 'cuenta':
          if (p >= 1) { if (e.nodo.textContent !== e.texto) e.nodo.textContent = e.texto; }
          else e.nodo.textContent = e.texto.slice(0, e.idx) + formatear(e.valor * easeOut(p), e.dec, e.miles) + e.texto.slice(e.idx + e.tok.length);
          break;
        case 'resalta':
          if (p >= 1) { e.el.style.backgroundImage = e.estilo.bi; e.el.style.backgroundSize = e.estilo.bs; e.el.style.backgroundRepeat = e.estilo.br; e.el.style.backgroundColor = e.estilo.bc; }
          else { e.el.style.backgroundColor = 'transparent'; e.el.style.backgroundImage = `linear-gradient(${e.color},${e.color})`; e.el.style.backgroundRepeat = 'no-repeat'; e.el.style.backgroundSize = `${(easeOut(p) * 100).toFixed(1)}% 100%`; }
          break;
      }
    }
    if (ovlPrev) { const q = P.entrada === 'anterior' ? 1 - clamp(T / P.t_entrada) : 0; ovlPrev.style.opacity = q.toFixed(3); ovlPrev.style.display = q > 0 ? 'block' : 'none'; }
    if (ovlBlanco) {
      let q = 0;
      if (P.entrada === 'blanco') q = Math.max(q, 1 - clamp(T / P.t_entrada));
      if (P.salida_blanco) q = Math.max(q, clamp((T - (P.dur - P.t_salida)) / P.t_salida));
      ovlBlanco.style.opacity = q.toFixed(3); ovlBlanco.style.display = q > 0 ? 'block' : 'none';
    }
  }
  window.__anim = { preparar, render };
})();
