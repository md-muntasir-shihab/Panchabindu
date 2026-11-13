export default function LoadingPage() {
  return (
    <main aria-busy="true" className="mx-auto min-h-screen max-w-7xl space-y-6 px-4 py-12 text-ink">
      <p role="status">তথ্য লোড হচ্ছে…</p>
      <div aria-hidden="true" className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="aspect-[3/4] animate-pulse rounded-[var(--radius-md)] border border-border bg-surface motion-reduce:animate-none" />
        ))}
      </div>
    </main>
  );
}
