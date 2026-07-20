import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <div className="text-5xl font-extrabold text-slate-200">404</div>
      <h1 className="mt-2 text-xl font-bold">Page not found</h1>
      <p className="mt-1 text-sm text-slate-500">That page doesn&apos;t exist or has moved.</p>
      <Link
        href="/"
        className="mt-5 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-dark"
      >
        Back to markets
      </Link>
    </div>
  );
}
