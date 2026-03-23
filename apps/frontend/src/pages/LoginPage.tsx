import { useState } from "react";
import { useNavigate } from "react-router-dom";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FieldErrors {
  email?: string;
  password?: string;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);

  function validateEmail(value: string): string | undefined {
    if (!value) return "Email is required.";
    if (!EMAIL_RE.test(value)) return "Enter a valid email address.";
    return undefined;
  }

  function validatePassword(value: string): string | undefined {
    if (!value) return "Password is required.";
    if (value.length < 8) return "Password must be at least 8 characters.";
    return undefined;
  }

  function handleBlur(field: "email" | "password") {
    const error =
      field === "email" ? validateEmail(email) : validatePassword(password);
    setErrors((prev) => ({ ...prev, [field]: error }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const emailErr = validateEmail(email);
    const passwordErr = validatePassword(password);
    const next: FieldErrors = { email: emailErr, password: passwordErr };
    setErrors(next);
    if (emailErr || passwordErr) return;

    setLoading(true);
    setTimeout(() => {
      navigate("/dashboard");
    }, 1000);
  }

  return (
    <div className="ew-login">
      <div className="ew-login__card">
        <h1>EmbassyWatch</h1>
        <p>Sign in to access the monitoring platform.</p>
        <form onSubmit={handleSubmit} noValidate>
          <div className="ew-login__field">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => handleBlur("email")}
              className={errors.email ? "ew-login__input--error" : ""}
            />
            {errors.email && (
              <div className="ew-login__error">{errors.email}</div>
            )}
          </div>
          <div className="ew-login__field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => handleBlur("password")}
              className={errors.password ? "ew-login__input--error" : ""}
            />
            {errors.password && (
              <div className="ew-login__error">{errors.password}</div>
            )}
          </div>
          <label className="ew-login__checkbox">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Remember me
          </label>
          <button type="submit" className="ew-login__btn" disabled={loading}>
            {loading ? (
              <>
                <span className="ew-login__spinner" />
                Signing in...
              </>
            ) : (
              "Sign in"
            )}
          </button>
        </form>
        <div className="ew-login__disclaimer">
          For demonstration purposes only — not connected to real systems
        </div>
      </div>
    </div>
  );
}
