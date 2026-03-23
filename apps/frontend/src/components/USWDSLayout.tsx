import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { usePreferencesStore } from "../stores/usePreferencesStore";

const sidebarItems = [
  { to: "/dashboard", icon: "\u{1F4CA}", label: "Dashboard" },
  { to: "/embassies", icon: "\u{1F3DB}", label: "Embassy List" },
  { to: "/watchlist", icon: "\u{1F441}", label: "Watchlist" },
  { to: "/settings", icon: "\u2699\uFE0F", label: "Settings" },
];

function buildBreadcrumbs(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  return parts.map((part, i) => ({
    label: part.charAt(0).toUpperCase() + part.slice(1),
    path: "/" + parts.slice(0, i + 1).join("/"),
    isLast: i === parts.length - 1,
  }));
}

export default function USWDSLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const location = useLocation();
  const breadcrumbs = buildBreadcrumbs(location.pathname);
  const { theme, toggleTheme } = usePreferencesStore();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <>
      {/* Gov Banner */}
      <div className="gov-banner">
        <svg
          className="gov-banner__flag"
          viewBox="0 0 16 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect width="16" height="12" fill="#B22234" />
          <rect y="1" width="16" height="1" fill="#FFF" />
          <rect y="3" width="16" height="1" fill="#FFF" />
          <rect y="5" width="16" height="1" fill="#FFF" />
          <rect y="7" width="16" height="1" fill="#FFF" />
          <rect y="9" width="16" height="1" fill="#FFF" />
          <rect y="11" width="16" height="1" fill="#FFF" />
          <rect width="7" height="6" fill="#3C3B6E" />
        </svg>
        <span>
          EmbassyWatch — Embassy Monitoring Platform
        </span>
      </div>

      {/* Header */}
      <header className="ew-header">
        <Link to="/dashboard" className="ew-header__logo">
          <span className="ew-header__logo-icon">{"\u{1F3DB}"}</span>
          EmbassyWatch
        </Link>

        <div className="ew-header__right">
          <nav>
            <ul className="ew-header__nav">
              <li>
                <NavLink to="/dashboard" className="ew-header__nav-link">
                  Dashboard
                </NavLink>
              </li>
              <li>
                <NavLink to="/embassies" className="ew-header__nav-link">
                  Embassies
                </NavLink>
              </li>
              <li>
                <NavLink to="/admin" className="ew-header__nav-link">
                  Admin
                </NavLink>
              </li>
            </ul>
          </nav>

          <div className="ew-user-menu">
            <button
              className="ew-user-menu__trigger"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              aria-label="User menu"
            >
              JD
            </button>
            {userMenuOpen && (
              <div className="ew-user-menu__dropdown">
                <button
                  className="ew-user-menu__item ew-user-menu__theme"
                  onClick={() => {
                    toggleTheme();
                  }}
                >
                  {theme === "light" ? (
                    <svg className="ew-user-menu__icon" viewBox="0 0 20 20" fill="none">
                      <path d="M17.3 12.3a7.5 7.5 0 0 1-9.6-9.6 7.5 7.5 0 1 0 9.6 9.6Z" fill="#2E75B6" />
                    </svg>
                  ) : (
                    <svg className="ew-user-menu__icon" viewBox="0 0 20 20" fill="none">
                      <circle cx="10" cy="10" r="4" fill="#E87722" />
                      <g stroke="#E87722" strokeWidth="1.5" strokeLinecap="round">
                        <line x1="10" y1="1" x2="10" y2="3.5" />
                        <line x1="10" y1="16.5" x2="10" y2="19" />
                        <line x1="1" y1="10" x2="3.5" y2="10" />
                        <line x1="16.5" y1="10" x2="19" y2="10" />
                        <line x1="3.6" y1="3.6" x2="5.4" y2="5.4" />
                        <line x1="14.6" y1="14.6" x2="16.4" y2="16.4" />
                        <line x1="3.6" y1="16.4" x2="5.4" y2="14.6" />
                        <line x1="14.6" y1="5.4" x2="16.4" y2="3.6" />
                      </g>
                    </svg>
                  )}
                  {theme === "light" ? "Dark mode" : "Light mode"}
                </button>
                <Link
                  to="/settings"
                  className="ew-user-menu__item"
                  onClick={() => setUserMenuOpen(false)}
                >
                  Settings
                </Link>
                <button
                  className="ew-user-menu__item"
                  onClick={() => setUserMenuOpen(false)}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="ew-layout">
        {/* Sidebar */}
        <aside
          className={`ew-sidebar ${sidebarCollapsed ? "ew-sidebar--collapsed" : ""}`}
        >
          <button
            className="ew-sidebar__toggle"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? "\u25B6" : "\u25C0"}
          </button>
          <ul className="ew-sidebar__nav">
            {sidebarItems.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} className="ew-sidebar__link">
                  <span className="ew-sidebar__icon">{item.icon}</span>
                  <span className="ew-sidebar__label">{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </aside>

        {/* Main */}
        <main className="ew-main">
          <nav className="ew-breadcrumb" aria-label="Breadcrumb">
            <Link to="/dashboard">Home</Link>
            {breadcrumbs.map((crumb) => (
              <span key={crumb.path}>
                <span className="ew-breadcrumb__sep">/</span>
                {crumb.isLast ? (
                  <span>{crumb.label}</span>
                ) : (
                  <Link to={crumb.path}>{crumb.label}</Link>
                )}
              </span>
            ))}
          </nav>
          <div className="ew-content">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Footer */}
      <footer className="ew-footer">
        <div className="ew-footer__top">
          <div className="ew-footer__brand">
            <h3>EmbassyWatch</h3>
            <p>
              Monitoring and reporting platform for U.S. embassy and consulate
              operations worldwide.
            </p>
          </div>
          <div className="ew-footer__links">
            <div className="ew-footer__links-column">
              <h4>Platform</h4>
              <ul>
                <li><Link to="/dashboard">Dashboard</Link></li>
                <li><Link to="/embassies">Embassies</Link></li>
                <li><Link to="/admin">Admin</Link></li>
              </ul>
            </div>
            <div className="ew-footer__links-column">
              <h4>Support</h4>
              <ul>
                <li><a href="#contact">Contact</a></li>
                <li><a href="#docs">Documentation</a></li>
                <li><a href="#accessibility">Accessibility</a></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="ew-footer__bottom">
          EmbassyWatch is not affiliated with the U.S. government.
        </div>
      </footer>
    </>
  );
}
