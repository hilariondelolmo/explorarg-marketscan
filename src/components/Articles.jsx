import { useState, useMemo } from 'react';
import articles from '../data/articles.json';
import articleContent from '../data/article-content.json';
import './Articles.css';

export default function Articles({ onOpenArticle }) {
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('newest');
  const [activeTags, setActiveTags] = useState(new Set());

  // Tag frequencies para el cloud
  const tagCloud = useMemo(() => {
    const freq = {};
    articles.forEach((a) => a.tags?.forEach((t) => { freq[t] = (freq[t] || 0) + 1; }));
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 20);
  }, []);

  const years = useMemo(() => {
    const s = new Set(articles.map((a) => a.year));
    return [...s].sort((a, b) => b - a);
  }, []);

  const toggleTag = (tag) => {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return articles
      .filter((a) => {
        if (yearFilter !== 'all' && String(a.year) !== yearFilter) return false;
        if (activeTags.size > 0) {
          const hasAll = [...activeTags].every((t) => a.tags?.includes(t));
          if (!hasAll) return false;
        }
        if (q) {
          const hay = (a.title + ' ' + (a.tesis || '') + ' ' + (a.tags || []).join(' ')).toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => sortOrder === 'newest'
        ? (b.date || '').localeCompare(a.date || '')
        : (a.date || '').localeCompare(b.date || ''));
  }, [search, yearFilter, sortOrder, activeTags]);

  const handleArticleClick = (e, article) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    if (!articleContent[article.id]) return; // fallback: dejar el navegador seguir el href
    e.preventDefault();
    onOpenArticle(article.id, article.title, article.url);
  };

  return (
    <section id="articles" className="pagina-cabecera">
      <div className="container">
        <div className="section-header">
          <h2>Editoriales y análisis del mercado</h2>
          <p>
            25 artículos publicados en explorarg.com sobre biodiesel, marco legal, estructura de
            mercado y posiciones de política pública. Al hacer click en cada título se abre el
            análisis sintetizado dentro del tablero, con enlace al texto original completo.
          </p>
        </div>

        <div className="articles-controls">
          <input
            type="search"
            placeholder="Buscar por título, tesis o tag…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="articles-search"
          />
          <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className="articles-select">
            <option value="all">Todos los años</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="articles-select">
            <option value="newest">Más recientes primero</option>
            <option value="oldest">Más antiguos primero</option>
          </select>
        </div>

        <div className="tag-cloud">
          <span className="tag-cloud-label">Tags más frecuentes:</span>
          {tagCloud.map(([tag, count]) => (
            <button
              key={tag}
              className={`tag-chip ${activeTags.has(tag) ? 'active' : ''}`}
              onClick={() => toggleTag(tag)}
            >
              {tag} <span className="tag-count">{count}</span>
            </button>
          ))}
          {activeTags.size > 0 && (
            <button className="tag-clear" onClick={() => setActiveTags(new Set())}>
              Limpiar filtros
            </button>
          )}
        </div>

        <div className="articles-meta">
          {filtered.length} de {articles.length} artículos · {activeTags.size > 0 && `filtros: ${[...activeTags].join(', ')}`}
        </div>

        <div className="article-list">
          {filtered.length === 0 && (
            <div className="no-results">Sin resultados para los filtros aplicados.</div>
          )}
          {filtered.map((a) => {
            const hasContent = !!articleContent[a.id];
            return (
              <article key={a.id} className="entry">
                <div className="date">{a.date}</div>
                <div>
                  <h3>
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={hasContent ? 'article-link' : ''}
                      onClick={(e) => handleArticleClick(e, a)}
                    >
                      {a.title}
                    </a>
                  </h3>
                  {a.tesis && <div className="tesis">{a.tesis}</div>}
                  {a.tags && (
                    <div className="tags">
                      {a.tags.map((t) => (
                        <span key={t} className="tag">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
