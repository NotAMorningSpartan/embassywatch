import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { usePreferencesStore } from "../stores/usePreferencesStore";
import { useAuthStore } from "../stores/useAuthStore";
import { useLogout } from "../hooks/useAuth";

const SidebarIcons = {
  dashboard: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="4" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="11" width="7" height="10" rx="1" />
    </svg>
  ),
  embassies: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      {/* Pediment triangle */}
      <polygon points="12,2 3,9 21,9" />
      {/* Entablature beam */}
      <rect x="3" y="9" width="18" height="2" />
      {/* Columns */}
      <rect x="5" y="11" width="2.5" height="9" rx="0.3" />
      <rect x="10.75" y="11" width="2.5" height="9" rx="0.3" />
      <rect x="16.5" y="11" width="2.5" height="9" rx="0.3" />
      {/* Base */}
      <rect x="2" y="20" width="20" height="2" rx="0.5" />
    </svg>
  ),
  watchlist: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26z" />
    </svg>
  ),
  settings: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
};

const sidebarItems = [
  { to: "/dashboard", icon: SidebarIcons.dashboard, label: "Dashboard" },
  { to: "/embassies", icon: SidebarIcons.embassies, label: "Embassy List" },
  { to: "/watchlist", icon: SidebarIcons.watchlist, label: "Watchlist" },
  { to: "/settings", icon: SidebarIcons.settings, label: "Settings" },
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
  const navigate = useNavigate();
  const breadcrumbs = buildBreadcrumbs(location.pathname);
  const { theme, toggleTheme } = usePreferencesStore();
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();

  const initials = user
    ? user.displayName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

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
          <svg className="ew-header__logo-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            {/* Globe */}
            <circle cx="12" cy="12" r="9" />
            <ellipse cx="12" cy="12" rx="3.5" ry="9" />
            <path d="M3.5 8.5h17M3.5 15.5h17" />
            {/* Crosshairs */}
            <path d="M12 1v3M12 20v3M1 12h3M20 12h3" strokeWidth="2" strokeLinecap="round" />
            {/* Center dot */}
            <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
          </svg>
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
              {initials}
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
                  onClick={() => {
                    setUserMenuOpen(false);
                    logout.mutate();
                  }}
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
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`ew-sidebar__toggle-icon${sidebarCollapsed ? " ew-sidebar__toggle-icon--collapsed" : ""}`}
            >
              <polyline points="11,4 6,9 11,14" />
            </svg>
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
          <span>EmbassyWatch is not affiliated with the U.S. government.</span>
          <a
            href="https://github.com/NotAMorningSpartan/embassywatch"
            target="_blank"
            rel="noopener noreferrer"
            className="ew-footer__github"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            View Source on GitHub
          </a>
        </div>
      </footer>
    </>
  );
}
