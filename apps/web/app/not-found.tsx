import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-[900px] flex-col items-start px-5 py-24 sm:px-8">
      <span className="label">404 / Not in the ledger</span>
      <h1 className="display mt-5 text-[clamp(3rem,8vw,6rem)] text-ink">
        This dossier
        <br />
        does not exist.
      </h1>
      <p className="mt-6 max-w-md text-[0.9375rem] leading-relaxed text-muted">
        The run may have been removed, or the link may be wrong. The library holds the records that
        still exist.
      </p>
      <div className="mt-8 flex items-center gap-3">
        <Link href="/" className="btn btn-primary">
          Start a new run
        </Link>
        <Link href="/library" className="btn">
          Open the library
        </Link>
      </div>
    </main>
  );
}
