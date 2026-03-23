import { useNavigate } from "react-router-dom";

export default function LoginPage() {
  const navigate = useNavigate();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    navigate("/dashboard");
  }

  return (
    <div className="ew-login">
      <div className="ew-login__card">
        <h1>EmbassyWatch</h1>
        <p>Sign in to access the monitoring platform.</p>
        <form onSubmit={handleSubmit}>
          <div className="ew-login__field">
            <label htmlFor="email">Email address</label>
            <input id="email" type="email" autoComplete="email" />
          </div>
          <div className="ew-login__field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="current-password" />
          </div>
          <button type="submit" className="ew-login__btn">
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
