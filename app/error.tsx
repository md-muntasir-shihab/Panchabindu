'use client';

import { Button, Card } from '@/src/components/ui/primitives';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="min-h-screen bg-bg px-4 py-16 text-ink">
      <Card className="mx-auto max-w-lg space-y-4">
        <h1 className="text-xl font-bold">এই মুহূর্তে তথ্য লোড করা যাচ্ছে না</h1>
        <p role="alert" className="text-sm text-muted">কিছুক্ষণ পর আবার চেষ্টা করুন। সমস্যা চলতে থাকলে সহায়তার জন্য যোগাযোগ করুন।</p>
        <Button onClick={reset}>আবার চেষ্টা করুন</Button>
      </Card>
    </main>
  );
}
