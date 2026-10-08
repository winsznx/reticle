import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Mark } from "./Mark";
import { useTheme } from "../lib/theme";
import { facts } from "../lib/data";
import { oklinkAddr } from "../lib/chain";

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button className="btn sm icon" onClick={toggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} title="Toggle theme" style={{ width: 28 }}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        {theme === "dark" ? <><circle cx="8" cy="8" r="3" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M3 13l1.4-1.4M11.6 4.4 13 3" /></> : <path d="M13 9.5A5.5 5.5 0 0 1 6.5 3 5.5 5.5 0 1 0 13 9.5Z" />}
      </svg>
    </button>
  );
}

export function Layout() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return (
    <>
      <header className="hdr">
        <div className="wrap">
          <NavLink to="/" className="brand" aria-label="Reticle home">
            <Mark /> <span>Reticle</span>
          </NavLink>
          <nav className="nav" aria-label="Primary">
            {[["/make", "Make"], ["/gallery", "Gallery"], ["/embed", "Embed"], ["/proof", "Proof"]].map(([to, label]) => (
              <NavLink key={to} to={to!}>{label}</NavLink>
            ))}
          </nav>
          <div className="hdr-end"><ThemeToggle /></div>
        </div>
      </header>
      <main><Outlet /></main>
      <footer className="ftr">
        <div className="wrap">
          <div style={{ maxWidth: 560 }}>
            Unaudited. Built on TapeOut upgradeable beacon contracts on X Layer. Reticle mints ink for its own tapeouts only and never trades it.
          </div>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
            {facts.repo && <a href={facts.repo}>GitHub</a>}
            {facts.processor && <a href={oklinkAddr(facts.processor.circuits)}>Processor on OKLink</a>}
            <a href="/proof">Proof</a>
          </div>
        </div>
      </footer>
    </>
  );
}
