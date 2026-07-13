import Link from "next/link";

export default function HomePage() {
  return (
    <div className="card">
      <h1>Welcome to Cogna</h1>
      <p className="lead">
        Adaptive math practice for linear equations. Parents manage accounts;
        students practice with an access code.
      </p>
      <div className="actions">
        <Link href="/parent/login" className="btn btn-primary">
          Parent login
        </Link>
        <Link href="/student/login" className="btn btn-secondary">
          Student login
        </Link>
      </div>
    </div>
  );
}
